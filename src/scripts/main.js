import * as THREE from "three";
import {MindARThree} from 'mindar-image-three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import { createPerformanceTelemetry } from "./telemetry.js";
import { setupModelInteractions } from "./interactions.js";



const start = async () => {

    const telemetry = createPerformanceTelemetry({showHud: true});
    
    const mindarThree = new MindARThree({
        container: document.querySelector("#ar-container"),
        imageTargetSrc: './assets/targets.mind',
    });

    const {renderer, scene, camera } = mindarThree;

    const ambientLight = new THREE.AmbientLight(0xffffff, 1);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(0, 10, 5);
    scene.add(directionalLight);

    const anchor = mindarThree.addAnchor(0);

    let isTargetVisible = false;
    const baseScale = 0.5;

    const modelLoadStart = performance.now();
    const loader = new GLTFLoader();
    loader.load(
        './assets/model.glb',
        (gltf) => {
            telemetry.recordModelLoad(performance.now() - modelLoadStart);
            const model = gltf.scene;

            // model.scale.set(0.5,0.5,0.5);
            model.scale.setScalar(baseScale);
            model.position.set(0, 0, 0);

            anchor.group.add(model);

            setupModelInteractions({
                container,
                targetObject: model,
                isTracking: () => isTargetVisible,
                baseScale,
                onMeasureLatency: (ts) => telemetry.measureInteractionLatency(ts),
            });
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (error) => {
            console.error('Błąd podczas ładowania modelu 3D', error);
        }
    );

    anchor.onTargetFound = () => {
        telemetry.setTrackingState(true);
    };
    anchor.onTargetLost = () => {
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