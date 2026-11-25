import * as THREE from "three";
import {MindARThree} from 'mindar-image-three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import { createPerformanceTelemetry } from "./telemetry.js";
import { setupModelInteractions } from "./interactions.js";
import { createAppUi } from "./ui.js";

const FALLBACK_CATALOG = {
    defaultProductId: "table-minimal",
    products: [
        {
            "id": "mug-traditional",
            "label": "Tradycyjny",
            "title": "Kubek 50 cl",
            "price": "12,99 zł",
            "subtitle": "Modelowanie ręczne (Blender)",
            "modelUrl": "./assets/kubek_blender.glb",
            "scale": 1,
            "materials": [
                {
                    "id": "ceramicka",
                    "label": "Ceramika",
                    "swatchHex": "#77becc",
                    "colorHex": "#ffffff",
                    "mapUrl": "./assets/textures/blue_plaster_wall_diff_1k.jpg",
                    "roughnessMapUrl": "./assets/textures/blue_plaster_wall_rough_1k.png",
                    "normalMapUrl": "./assets/textures/blue_plaster_wall_nor_gl_1k.png",
                    "roughness": 0.25,
                    "metalness": 0.0,
                    "repeat": [2, 2]
                },
                {
                    "id": "tworzywo-sztuczne",
                    "label": "Tworzywo",
                    "swatchHex": "#d9b67e",
                    "colorHex": "#ffffff",
                    "mapUrl": "./assets/textures/linoleum_brown_diff_1k.jpg",
                    "roughnessMapUrl": "./assets/textures/linoleum_brown_rough_1k.png",
                    "normalMapUrl": "./assets/textures/linoleum_brown_nor_gl_1k.png",
                    "roughness": 0.65,
                    "metalness": 0.0,
                    "repeat": [2, 2]
                }
            ]
        },
    ],
};

async function loadProductsCatalog(url = "./src/data/products.json") {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return await response.json();
    } catch (err) {
        console.warn("Nie udało się wczytać products.json, wczytanie domyślne:", err);
        return FALLBACK_CATALOG;
    }
}

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();

function getTexture(url, { isColor = true, repeat = [1, 1] } = {}) {
    if (!url) return Promise.resolve(null);
    const repeatKey = `${repeat[0]}x${repeat[1]}`;
    const cacheKey = `${url}__${isColor ? "color" : "data"}__${repeatKey}`;
    if (textureCache.has(cacheKey)) return Promise.resolve(textureCache.get(cacheKey));

    return new Promise((resolve) => {
        textureLoader.load(
            url,
            (texture) => {
                texture.colorSpace = isColor ? THREE.SRGBColorSpace : THREE.NoColorSpace;
                texture.flipY = false;
                texture.wrapS = THREE.RepeatWrapping;
                texture.wrapT = THREE.RepeatWrapping;
                texture.repeat.set(repeat[0], repeat[1]);
                textureCache.set(cacheKey, texture);
                resolve(texture);
            },
            undefined,
            (err) => {
                console.error(`Błąd ładowania tekstury (${url}):`, err);
                resolve(null);
            }
        );
    });
}

async function applyMaterialVariant(root, variant) {
    if (!root || !variant) return;

    const repeat = Array.isArray(variant.repeat) && variant.repeat.length === 2
        ? variant.repeat
        : [1, 1];

    const mapUrl = variant.mapUrl ?? variant.maps?.map ?? variant.textureUrl ?? null;
    const roughnessMapUrl = variant.roughnessMapUrl ?? variant.maps?.roughnessMap ?? null;
    const normalMapUrl = variant.normalMapUrl ?? variant.maps?.normalMap ?? null;

    const [colorMap, roughnessMap, normalMap] = await Promise.all([
        getTexture(mapUrl, { isColor: true, repeat }),
        getTexture(roughnessMapUrl, { isColor: false, repeat }),
        getTexture(normalMapUrl, { isColor: false, repeat }),
    ]);

    const color = new THREE.Color(variant.colorHex || "#ffffff");
    const normalScale = Array.isArray(variant.normalScale) && variant.normalScale.length === 2
        ? variant.normalScale
        : [1, 1];

    root.traverse((child) => {
        if (!child.isMesh || !child.material) return;

        if (!child.userData.materialCloned) {
            child.material = child.material.clone();
            child.userData.materialCloned = true;
        }

        const mat = child.material;
        if (mat.color) mat.color.copy(color);
        if ("map" in mat) mat.map = colorMap || null;
        if ("roughnessMap" in mat) mat.roughnessMap = roughnessMap || null;
        if ("normalMap" in mat) mat.normalMap = normalMap || null;
        if (mat.normalScale) mat.normalScale.set(normalScale[0], normalScale[1]);
        if (typeof variant.roughness === "number" && "roughness" in mat) {
            mat.roughness = variant.roughness;
        }
        if (typeof variant.metalness === "number" && "metalness" in mat) {
            mat.metalness = variant.metalness;
        }
        mat.needsUpdate = true;
    });
}

const start = async () => {

    const telemetry = createPerformanceTelemetry({showHud: true});

    const catalog = await loadProductsCatalog("./src/data/products.json");
    const products = catalog.products || FALLBACK_CATALOG.products;
    const initialProduct = products.find((p) => p.id === catalog.defaultProductId) || products[0];
    
    const container = document.querySelector("#ar-container");
    const mindarThree = new MindARThree({
        container,
        imageTargetSrc: "./assets/targets.mind",
    });
    // const mindarThree = new MindARThree({
    //     container: document.querySelector("#ar-container"),
    //     imageTargetSrc: './assets/targets.mind',
    // });

    const {renderer, scene, camera } = mindarThree;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    const anchor = mindarThree.addAnchor(0);
    let isTargetVisible = false;
    let activeModel = null;
    let activeMaterial = initialProduct?.materials?.[0] || null;
    let cleanupInteractions = null;


    const loader = new GLTFLoader();
    const loadedModels = new Map();


    async function mountProduct(product) {
        if (!product) return;

        if (cleanupInteractions) {
            cleanupInteractions();
            cleanupInteractions = null;
        }

        if (activeModel) {
            anchor.group.remove(activeModel);
        }

        const model = loadedModels.get(product.id);
        if(!model) return;

        activeModel = model;
        activeModel.position.set(0, 0, 0);
        activeModel.rotation.set(0, 0, 0);
        activeModel.scale.setScalar(product.scale ?? 0.5);

        await applyMaterialVariant(activeModel, activeMaterial);
        anchor.group.add(activeModel);


        cleanupInteractions = setupModelInteractions({
            container,
            targetObject: activeModel,
            isTracking: () => isTargetVisible,
            baseScale: product.scale ?? 0.5,
            onMeasureLatency: (ts) => telemetry.measureInteractionLatency(ts),
        });

    }


    function loadProductModel(product, { mountImmediately = false} = {}) {
        if (!product) return;

        if (loadedModels.has(product.id)) {
            if(mountImmediately) mountProduct(product);
            return;
        }

        const t0 = performance.now();
        loader.load(
            product.modelUrl,
            (gltf) => {

                if (product.id === initialProduct.id) {
                    telemetry.recordModelLoad(performance.now() - t0);
                }

                loadedModels.set(product.id, gltf.scene);

                if (mountImmediately) {
                    mountProduct(product);
                }

            },
            undefined,
            (error) => {
                console.error(`Błąd podczas ładowania modelu (${product.id}):`, error);
            }
        );
    }

    createAppUi({
        initialMode: "client",
        products,
        initialProductId: initialProduct?.id,
        onSelectMaterial: async (variant) => {
            activeMaterial = variant;
            await applyMaterialVariant(activeModel, activeMaterial);
        },
        onSelectProduct: (product) => {
            activeMaterial = product.materials?.[0] || null;
            loadProductModel(product, {mountImmediately: true});
        },
        onSetTelemetryMinimized: (minimized) => telemetry.setMinimized(minimized),
        onMeasureLatency: (ts) => telemetry.measureInteractionLatency(ts),
    });

    loadProductModel(initialProduct, {mountImmediately: true});
    // const baseScale = 0.5;
    // const modelLoadStart = performance.now();
    



    // loader.load(
    //     './assets/model.glb',
    //     (gltf) => {
    //         telemetry.recordModelLoad(performance.now() - modelLoadStart);
    //         const model = gltf.scene;

    //         // model.scale.set(0.5,0.5,0.5);
    //         model.scale.setScalar(baseScale);
    //         model.position.set(0, 0, 0);

    //         anchor.group.add(model);

    //         setupModelInteractions({
    //             container,
    //             targetObject: model,
    //             isTracking: () => isTargetVisible,
    //             baseScale,
    //             onMeasureLatency: (ts) => telemetry.measureInteractionLatency(ts),
    //         });
    //     },
    //     (xhr) => {
    //         console.log((xhr.loaded / xhr.total * 100) + '% loaded');
    //     },
    //     (error) => {
    //         console.error('Błąd podczas ładowania modelu 3D', error);
    //     }
    // );

    anchor.onTargetFound = () => {
        isTargetVisible = true;
        telemetry.setTrackingState(true);
    };
    anchor.onTargetLost = () => {
        isTargetVisible = false;
        telemetry.setTrackingState(false);
    };

    const arStart = performance.now();
    await mindarThree.start();

    telemetry.recordArStart(performance.now() - arStart);
    renderer.setAnimationLoop(() => {
        const frameStart = telemetry.beginFrame();
        renderer.render(scene, camera);
        telemetry.endFrame(frameStart);
    });

    window.exportTelemetry = () => telemetry.downloadJson();
};

start();