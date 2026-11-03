import * as THREE from "three";
import {MINDARThree} from 'mindar-image-three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

const start = async () => {
    
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

    const loader = new GLTFLoader();
    loader.load(
        './assets/model.glb',
        (gltf) => {
            const model = gltf.scene;

            model.scale.set(0.5,0.5,0.5);
            model.position.set(0, 0, 0);

            anchor.group.add(model);
        },
        (xhr) => {
            console.log((xhr.loaded / xhr.total * 100) + '% loaded');
        },
        (error) => {
            console.error('Błąd podczas ładowania modelu 3D', error);
        }
    );

    await mindarThree.start();
    renderer.setAnimationLoop(() => {
        renderer.render(scene, camera);
    });
};

start();