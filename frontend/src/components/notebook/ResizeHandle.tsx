"use client";

interface ResizeHandleProps {
  onResize: (delta: number) => void;
}

export function ResizeHandle({ onResize }: ResizeHandleProps): JSX.Element {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className="relative w-1 shrink-0 cursor-col-resize bg-transparent hover:bg-[#C8CEDD]"
      onPointerDown={(event) => {
        let lastX = event.clientX;
        const handle = event.currentTarget;
        handle.setPointerCapture(event.pointerId);

        const move = (moveEvent: PointerEvent): void => {
          const delta = moveEvent.clientX - lastX;
          lastX = moveEvent.clientX;
          onResize(delta);
        };

        const up = (upEvent: PointerEvent): void => {
          handle.releasePointerCapture(upEvent.pointerId);
          handle.removeEventListener("pointermove", move);
          handle.removeEventListener("pointerup", up);
          handle.removeEventListener("pointercancel", up);
        };

        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", up);
        handle.addEventListener("pointercancel", up);
      }}
    />
  );
}
