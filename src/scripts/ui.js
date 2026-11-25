export function createAppUi({
    initialMode = "client",
    products = [],
    initialProductId,
    onSelectMaterial,
    onSelectProduct,
    onModeChange,
    onSetTelemetryMinimized,
    onMeasureLatency,
}) {

    let currentMode = initialMode;

    let activeProduct =
        products.find((p) => p.id === initialProductId) || products[0] || null;

    let activeMaterialId = activeProduct?.materials?.[0]?.id || null;

    const rootEl = document.createElement("div");
    rootEl.className = "ar-ui-root";

    const modeBarEl = document.createElement("div");
    modeBarEl.className = "ar-mode-bar";

    const clientBtnEl = document.createElement("button");
    clientBtnEl.type = "button";
    clientBtnEl.className = "ar-mode-btn";
    clientBtnEl.innerHTML = '<i class="bi bi-person" aria-hidden="true"></i>';
    clientBtnEl.title = "Tryb Klient";
    clientBtnEl.setAttribute("aria-label", "Tryb Klient");

    const devBtnEl = document.createElement("button");
    devBtnEl.type = "button";
    devBtnEl.className = "ar-mode-btn";
    devBtnEl.innerHTML = '<i class="bi bi-wrench-adjustable" aria-hidden="true"></i>';
    devBtnEl.title = "Tryb Deweloper";
    devBtnEl.setAttribute("aria-label", "Tryb Deweloper");

    modeBarEl.append(clientBtnEl, devBtnEl);

    const infoCardEl = document.createElement("section");
    infoCardEl.className = "ar-info-card";

    function makeDraggable(el, { baseTransform = "", onDragStateChange } = {}) {
        let startX = 0;
        let startY = 0;
        let currentX = 0;
        let currentY = 0;
        let isDragging = false;
        let hasMoved = false;

        el.addEventListener("pointerdown", (e) => {
            if (e.pointerType === "mouse" && e.button !== 0) return;

            isDragging = true;
            hasMoved = false;
            el.classList.add("ar-dragging");

            startX = e.clientX - currentX;
            startY = e.clientY - currentY;

            el.setPointerCapture(e.pointerId);
        });

        el.addEventListener("pointermove", (e) => {
            if (!isDragging) return;

            const rawX = e.clientX - startX;
            const rawY = e.clientY - startY;

            if (!hasMoved && Math.hypot(rawX - currentX, rawY - currentY) < 6) {
                return;
            }
            hasMoved = true;

            const rect = el.getBoundingClientRect();
            const baseLeft = rect.left - currentX;
            const baseTop = rect.top - currentY;

            const minX = 8 - baseLeft;
            const maxX = window.innerWidth - rect.width - 8 - baseLeft;

            const minY = 8 - baseTop;
            const maxY = window.innerHeight - rect.height - 8 - baseTop;

            currentX = Math.min(Math.max(rawX, minX), maxX);
            currentY = Math.min(Math.max(rawY, minY), maxY);

            el.style.transform = `${baseTransform} translate3d(${currentX}px, ${currentY}px, 0)`.trim();
        });

        function stopDrag(e) {
            if (!isDragging) return;
            isDragging = false;
            el.classList.remove("ar-dragging");

            if (el.hasPointerCapture && el.hasPointerCapture(e.pointerId)) {
                el.releasePointerCapture(e.pointerId);
            }

            if (hasMoved && onDragStateChange) {
                onDragStateChange();
            }
        }

        el.addEventListener("pointerup", stopDrag);
        el.addEventListener("pointercancel", stopDrag);
    }

    let suppressModeClick = false;
    makeDraggable(modeBarEl, {
        baseTransform: "translateY(-50%)",
        onDragStateChange: () => {
            suppressModeClick = true;
            setTimeout(() => {
                suppressModeClick = false;
            }, 50);
        },
    });

    const infoTopRowEl = document.createElement("div");
    infoTopRowEl.className = "ar-info-card-top";

    const titleEl = document.createElement("h1");
    titleEl.className = "ar-info-card-title";

    const priceEl = document.createElement("span");
    priceEl.className = "ar-info-card-price";

    infoTopRowEl.append(titleEl, priceEl);

    const subtitleEl = document.createElement("p");
    subtitleEl.className = "ar-info-card-subtitle";

    infoCardEl.append(infoTopRowEl, subtitleEl);

    const controlsEl = document.createElement("div");
    controlsEl.className = "ar-controls-panel";

    const materialRowEl = document.createElement("div");
    materialRowEl.className = "ar-controls-row";

    const materialLabelEl = document.createElement("span");
    materialLabelEl.className = "ar-controls-label";
    materialLabelEl.innerHTML = '<i class="bi bi-palette2" aria-hidden="true"></i><span>Wariant</span>';

    const materialButtonsWrapEl = document.createElement("div");
    materialButtonsWrapEl.className = "ar-controls-group";

    materialRowEl.append(materialLabelEl, materialButtonsWrapEl);

    const productRowEl = document.createElement("div");
    productRowEl.className = "ar-controls-row ar-model-switcher";

    const productLabelEl = document.createElement("span");
    productLabelEl.className = "ar-controls-label";
    productLabelEl.innerHTML = '<i class="bi bi-box-seam" aria-hidden="true"></i><span>Model</span>';

    const productButtonsWrapEl = document.createElement("div");
    productButtonsWrapEl.className = "ar-controls-group";

    const productBtnMap = new Map();

    products.forEach((product) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ar-chip-btn";
        btn.textContent = product.label || product.title;

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            if (onMeasureLatency) onMeasureLatency(e.timeStamp);
            setActiveProduct(product);
            if (onSelectProduct) onSelectProduct(product);
        });

        productButtonsWrapEl.appendChild(btn);
        productBtnMap.set(product.id, btn);
    });

    productRowEl.append(productLabelEl, productButtonsWrapEl);
    controlsEl.append(materialRowEl, productRowEl);

    rootEl.append(modeBarEl, infoCardEl, controlsEl);
    document.body.appendChild(rootEl);

    const materialBtnMap = new Map();

    function renderMaterialButtons(product) {
        materialButtonsWrapEl.innerHTML = "";
        materialBtnMap.clear();

        const materials = product?.materials || [];
        materials.forEach((variant) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "ar-swatch-btn";
            btn.title = variant.label;

            const dot = document.createElement("span");
            dot.className = "ar-swatch-dot";
            dot.style.backgroundColor = variant.swatchHex || variant.colorHex || "#cccccc";

            const text = document.createElement("span");
            text.textContent = variant.label;

            btn.append(dot, text);
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (onMeasureLatency) onMeasureLatency(e.timeStamp);
                activeMaterialId = variant.id;
                refreshButtons();
                if (onSelectMaterial) onSelectMaterial(variant);
            });

            materialButtonsWrapEl.appendChild(btn);
            materialBtnMap.set(variant.id, btn);
        });
    }

    function refreshButtons() {
        clientBtnEl.classList.toggle("ar-mode-btn--active", currentMode === "client");
        devBtnEl.classList.toggle("ar-mode-btn--active", currentMode === "developer");

        materialBtnMap.forEach((btn, id) => {
            btn.classList.toggle("ar-swatch-btn--active", id === activeMaterialId);
        });

        productBtnMap.forEach((btn, id) => {
            btn.classList.toggle("ar-chip-btn--active", id === activeProduct?.id);
        });
    }

    function setActiveProduct(product) {
        if (!product) return;
        activeProduct = product;
        activeMaterialId = product.materials?.[0]?.id || null;

        titleEl.textContent = product.title || "";
        priceEl.textContent = product.price || "";
        subtitleEl.textContent = product.subtitle || "";

        renderMaterialButtons(product);
        refreshButtons();
    }

    function applyMode(mode) {
        currentMode = mode === "developer" ? "developer" : "client";
        const isDev = currentMode === "developer";

        document.body.classList.toggle("ar-mode-client", !isDev);
        document.body.classList.toggle("ar-mode-developer", isDev);

        infoCardEl.hidden = isDev;
        productRowEl.hidden = !isDev;

        const hudEl = document.querySelector(".ar-telemetry-hud");
        if (hudEl) {
            hudEl.hidden = !isDev;
        }
        if (!isDev && onSetTelemetryMinimized) {
            onSetTelemetryMinimized(false);
        }

        refreshButtons();
        if (onModeChange) onModeChange(currentMode);
    }

    clientBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (suppressModeClick) return;
        if (onMeasureLatency) onMeasureLatency(e.timeStamp);
        applyMode("client");
    });

    devBtnEl.addEventListener("click", (e) => {
        e.stopPropagation();
        if (suppressModeClick) return;
        if (onMeasureLatency) onMeasureLatency(e.timeStamp);
        applyMode("developer");
    });

    if (activeProduct) {
        setActiveProduct(activeProduct);
    }
    applyMode(currentMode);

    return {
        getMode: () => currentMode,
        setMode: applyMode,
        setActiveProduct,
    };
}