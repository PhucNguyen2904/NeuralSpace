"""OpenTelemetry tracing bootstrap."""

from __future__ import annotations

import os
from typing import Any

from app.core.logging import get_logger

logger = get_logger(__name__)


def setup_tracing(app: Any, db_engine: Any | None = None) -> None:
    """
    Configure OpenTelemetry for FastAPI + SQLAlchemy + Redis + httpx.

    Uses OTLP gRPC exporter endpoint from `OTEL_EXPORTER_OTLP_ENDPOINT`.
    """
    endpoint = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
    if not endpoint:
        return

    try:
        from opentelemetry import propagate, trace
        from opentelemetry.exporter.otlp.proto.grpc.trace_exporter import OTLPSpanExporter
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
        from opentelemetry.instrumentation.httpx import HTTPXClientInstrumentor
        from opentelemetry.instrumentation.redis import RedisInstrumentor
        from opentelemetry.instrumentation.sqlalchemy import SQLAlchemyInstrumentor
        from opentelemetry.propagators.composite import CompositePropagator
        from opentelemetry.propagators.textmap import TextMapPropagator
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor
        from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator
    except Exception as exc:
        logger.warning("Tracing dependencies unavailable", error=str(exc))
        return

    class XTraceIdPropagator(TextMapPropagator):
        """Propagate `X-Trace-ID` header as baggage-like value for interoperability."""

        def extract(self, carrier, context=None, getter=None):
            _ = getter
            from opentelemetry.baggage import set_baggage

            ctx = context
            trace_id = None
            if isinstance(carrier, dict):
                trace_id = carrier.get("x-trace-id") or carrier.get("X-Trace-ID")
            if trace_id:
                ctx = set_baggage("x-trace-id", trace_id, context=ctx)
            return ctx

        def inject(self, carrier, context=None, setter=None):
            _ = setter
            from opentelemetry.baggage import get_baggage

            trace_id = get_baggage("x-trace-id", context=context)
            if trace_id and isinstance(carrier, dict):
                carrier["x-trace-id"] = trace_id

        @property
        def fields(self):
            return {"x-trace-id"}

    resource = Resource.create({"service.name": os.getenv("OTEL_SERVICE_NAME", "cloud-ide-api")})
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(OTLPSpanExporter(endpoint=endpoint, insecure=True)))
    trace.set_tracer_provider(provider)
    propagate.set_global_textmap(CompositePropagator([TraceContextTextMapPropagator(), XTraceIdPropagator()]))

    FastAPIInstrumentor.instrument_app(app)
    HTTPXClientInstrumentor().instrument()
    RedisInstrumentor().instrument()
    if db_engine is not None:
        SQLAlchemyInstrumentor().instrument(engine=db_engine.sync_engine)

    logger.info("Tracing initialized", endpoint=endpoint)
