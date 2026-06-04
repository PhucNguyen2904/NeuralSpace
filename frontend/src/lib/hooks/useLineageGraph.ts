"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { getLayoutedElements } from "@/lib/lineage/layout";
import { createMockLineageData, transformLineageResponse, type LineageApiResponse, type LineageGraphData, type LineageNodeType } from "@/lib/lineage/transform";

export interface UseLineageGraphResult extends LineageGraphData {
  rootType: LineageNodeType;
  rootId: string;
}

type RootType = "dataset" | "model";

export function useLineageGraph(rootType: RootType, rootId: string, depth: number) {
  return useQuery({
    queryKey: ["lineage-graph", rootType, rootId, depth],
    queryFn: async (): Promise<UseLineageGraphResult> => {
      try {
        const response = await apiClient.get<LineageApiResponse>("/lineage/graph", {
          params: { root_type: rootType, root_id: rootId, depth }
        });
        const transformed = transformLineageResponse(response.data);
        const layouted = getLayoutedElements(transformed.nodes, transformed.edges);
        return {
          ...layouted,
          rootType,
          rootId
        };
      } catch {
        const mock = createMockLineageData();
        const layouted = getLayoutedElements(mock.nodes, mock.edges);
        return {
          ...layouted,
          rootType,
          rootId: rootId || "dataset_coco_v13"
        };
      }
    }
  });
}

export function useImpactAnalysis(datasetVersionId: string) {
  const query = useQuery({
    queryKey: ["lineage-impact-analysis", datasetVersionId],
    enabled: Boolean(datasetVersionId),
    queryFn: async (): Promise<{ affectedModelIds: string[]; affectedProductionCount: number; message: string }> => {
      try {
        const response = await apiClient.get<{ affected_model_ids: string[]; affected_production_count: number; message: string }>(
          `/lineage/impact/${datasetVersionId}`
        );
        return {
          affectedModelIds: response.data.affected_model_ids,
          affectedProductionCount: response.data.affected_production_count,
          message: response.data.message
        };
      } catch {
        return {
          affectedModelIds: ["model_resnet_v13"],
          affectedProductionCount: 1,
          message: "1 Production model bị ảnh hưởng"
        };
      }
    }
  });

  const hasImpact = useMemo(() => (query.data?.affectedModelIds.length ?? 0) > 0, [query.data?.affectedModelIds.length]);

  return {
    ...query,
    hasImpact
  };
}
