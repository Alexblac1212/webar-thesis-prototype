export function setupModelInteractions({
    container,
    targetObject,
    isTracking,
    baseScale = 0.5,
    minScale = 0.5,
    maxScale = 2.0,
    onMeasureLatency,
}) {
    if (!targetObject) return () => {};

    let isDragging = false;
    let lastX = 0;
    let lastY = 0;

    const activePointers = new Map();
    let initialPinchDistance = null;
    let scaleMultiplier = 1;

    targetObject.scale.setScalar(baseScale * scaleMultiplier);

    const rotationSpeed = 0.012;
    const tiltSpeed = 0.005;
    const maxTiltX = 0.35;

    function getPinchDistance() {
        const points = Array.from(activePointers.values());
        if (points.length < 2) return null;
        const dx = points[0].x - points[1].x;
        const dy = points[0].y - points[1].y;
        return Math.hypot(dx, dy);
    }

    function onPointerDown(event) {
        if (event.target.closest(".ar-telemetry-hud")) return;

        if (onMeasureLatency) {
            onMeasureLatency(event.timeStamp);
        }

        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (activePointers.size === 1) {
            isDragging = true;
            lastX = event.clientX;
            lastY = event.clientY;
            initialPinchDistance = null;
        } else if (activePointers.size === 2) {
            isDragging = false;
            initialPinchDistance = getPinchDistance();
        }
    }

    function onPointerMove(event) {
        if (!activePointers.has(event.pointerId)) return;

        activePointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        if (onMeasureLatency) {
            onMeasureLatency(event.timeStamp);
        }

        if (activePointers.size === 2) {
            const currentDistance = getPinchDistance();

            if (initialPinchDistance && currentDistance) {
                const ratio = currentDistance / initialPinchDistance;
                const nextMultiplier = Math.min(
                    maxScale,
                    Math.max(minScale, scaleMultiplier * ratio)
                );

                targetObject.scale.setScalar(baseScale * nextMultiplier);
            }
            return;
        }

        if (isDragging && activePointers.size === 1) {
            const deltaX = event.clientX - lastX;
            const deltaY = event.clientY - lastY;

            lastX = event.clientX;
            lastY = event.clientY;

            targetObject.rotation.y += deltaX * rotationSpeed;
            targetObject.rotation.x = Math.max(
                -maxTiltX,
                Math.min(maxTiltX, targetObject.rotation.x + deltaY * tiltSpeed)
            );
        }
    }

    function onPointerUp(event) {
        if (activePointers.size === 2 && initialPinchDistance) {
            const currentDistance = getPinchDistance();
            if (currentDistance) {
                const ratio = currentDistance / initialPinchDistance;
                scaleMultiplier = Math.min(
                    maxScale,
                    Math.max(minScale, scaleMultiplier * ratio)
                );
            }
        }

        activePointers.delete(event.pointerId);
        initialPinchDistance = null;

        if (activePointers.size === 1) {
            const remaining = Array.from(activePointers.values())[0];
            isDragging = true;
            lastX = remaining.x;
            lastY = remaining.y;
        } else {
            isDragging = false;
        }
    }

    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);

    return function cleanup() {
        window.removeEventListener("pointerdown", onPointerDown);
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        window.removeEventListener("pointercancel", onPointerUp);
    };
}