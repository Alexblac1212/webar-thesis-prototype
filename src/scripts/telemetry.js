export function createPerformanceTelemetry({ showHud = true } = {}) {
    
    const startTime = performance.now();

    const data = {
        meta: {
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            screen: `${window.screen.width}x${window.screen.height}`,
            devicePixelRatio: window.devicePixelRatio || 1,
            hardawreConcurrency: navigator.hardwareConcurrency || null,
        },
        loadTimes: {
            modelLoadMs: null,
            arStartMs: null,
            totalReadyMs: null,
            resources: [],
        },
        latency: {
            timeToFirstTargetMs: null,
            interactionLatenciesMs: [],
            frameTimeMs: [],
        },
        fps: {
            samples: [],
        }
        
    };

    let frameCount = 0;
    let lastFpsCheck = performance.now();
    let isTracking = false;
    let arStartedAt = null;
    let firstTergetDetected = false;

    let mainLineEl = null;
    let extraLineEl = null;


    if (showHud) {
        const hudEl = document.createElement("div");
        hudEl.className = "ar-telemetry-hud";

        mainLineEl = document.createElement("p");
        mainLineEl.className = "ar-telemetry-hud-line"
        mainLineEl.textContent = "FPS: -- | Frame: -- ms";

        extraLineEl = document.createElement("p");
        extraLineEl.className = "ar-telemetry-hud-line ar-telemetry-hud-extra"
        extraLineEl.textContent = "Ładowanie..."

        hudEl.append(mainLineEl, extraLineEl);
        document.body.appendChild(hudEl);
    }

    function updateHud(currentFps, frameMs) {
        if (!mainLineEl || !extraLineEl) return;
        const lastLat = data.latency.interactionLatenciesMs.at(-1);
        const loadText = data.loadTimes.totalReadyMs
            ? `${Math.round(data.loadTimes.totalReadyMs)}ms`
            : "...";
        const latText = lastLat !== undefined ? ` | Touch lat: ${lastLat.toFixed(1)}ms` : "";

        mainLineEl.textContent = `FPS: ${currentFps} | Frame: ${frameMs.toFixed(1)}ms`;
        extraLineEl.textContent = `Track: ${isTracking ? "TAK" : "NIE"} | Load: ${loadText}${latText}`;
    }

    function recordModelLoad(durationMs) {
        data.loadTimes.modelLoadMs = Number(durationMs.toFixed(2));
    }

    function recordArStart(durationMs){
        arStartedAt = performance.now();
        data.loadTimes.arStartMs = Number(durationMs.toFixed(2));
        data.loadTimes.totalReadyMs = Number((arStartedAt - startTime).toFixed(2));
        collectResourceTimings();
    }

    function collectResourceTimings() {
        const entries = performance.getEntriesByType("resource");
        data.loadTimes.resources = entries
            .filter((e) => e.name.includes(".glb") || e.name.includes(".mind"))
            .map((e) => ({
                name: e.name.split("/").pop(),
                durationMs: Number(e.duration.toFixed(2)),
                transferSizeBytes: e.transferSize || null,
            }));
    }

    function setTrackingState(visible) {
        isTracking = visible;
        if (visible && !firstTergetDetected && arStartedAt) {
            firstTergetDetected = true;
            data.latency.timeToFirstTargetMs = Number((performance.now() - arStartedAt).toFixed(2));

        }
    }


    function measureInteractionLatency(eventTimestamp = performance.now()) {
        requestAnimationFrame(() => {
            const latency = performance.now() - eventTimestamp;
            if (latency >= 0 && latency < 2000) {
                data.latency.interactionLatenciesMs.push(Number(latency.toFixed(2)));
            }
        });
    }

    function beginFrame() {
        return performance.now();
    }

    function endFrame(frameStartTime) {
        const now = performance.now();
        const frameDuration = now - frameStartTime;
        data.latency.frameTimeMs.push(Number(frameDuration.toFixed(2)));

        frameCount++;
        const elapsedSinceLastCheck = now - lastFpsCheck;

        if (elapsedSinceLastCheck >= 1000) {
            const currentFps = Math.round((frameCount * 1000) / elapsedSinceLastCheck);
            data.fps.samples.push({
                elapsedSec: Number(((now - startTime) / 1000).toFixed(1)),
                fps: currentFps,
                isTracking,
            });

            updateHud(currentFps, frameDuration);
            frameCount = 0;
            lastFpsCheck = now;
        }
    }


    function getSummary() {
        const fpsValues = data.fps.samples.map((s) => s.fps);
        const trackingFps = data.fps.samples.filter((s) => s.isTracking).map((s) => s.fps);
        const idleFps = data.fps.samples.filter((s) => !s.isTracking).map((s) => s.fps);
        const latValues = data.latency.interactionLatenciesMs;

        const avg = (arr) =>
            arr.length ? Number((arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2)) : null;

        return {
            ...data,
            summary: {
                avgFpsOverall: avg(fpsValues),
                minFpsOverall: fpsValues.length ? Math.min(...fpsValues) : null,
                maxFpsOverall: fpsValues.length ? Math.max(...fpsValues) : null,
                avgFpsTracking: avg(trackingFps),
                avgFpsIdle: avg(idleFps),
                avgInteractionLatencyMs: avg(latValues),
                avgFrameTimeMs: avg(data.latency.frameTimeMs),
            },
        };
    }

    function downloadJson() {
        const report = getSummary();
        const blob = new Blob([JSON.stringify(report, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `webar-perf-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }

    return {
        recordModelLoad,
        recordArStart,
        setTrackingState,
        measureInteractionLatency,
        beginFrame,
        endFrame,
        getSummary,
        downloadJson
    };



    
}