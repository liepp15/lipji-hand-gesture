import {
    HandLandmarker,
    FilesetResolver
} from "@mediapipe/tasks-vision";

const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gestureText = document.getElementById("gesture");
const fingerText = document.getElementById("fingerCount");
const loading = document.getElementById("loading");
const switchCamera = document.getElementById("switchCamera");

const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker;
let lastVideoTime = -1;

let currentGesture = "circle";
let targetGesture = "circle";
let gestureCandidate = "";
let gestureStableFrames = 0;

let handX = 0;
let handY = 0;

let cameraFacing = "user";

const PARTICLE_COUNT = 280;

const PARTICLE_COLOR = "#7DDCFF";
const PARTICLE_GLOW = "#BDEEFF";

const particles = [];

let morphStartTime = 0;
const MORPH_DURATION = 850;

let rotationY = 0;
let rotationX = 0;

let time = 0;


// ============================================================
// INIT MEDIAPIPE
// ============================================================

async function init() {

    try {

        console.log("Loading MediaPipe...");

        const vision =
            await FilesetResolver.forVisionTasks(WASM_URL);

        handLandmarker =
            await HandLandmarker.createFromOptions(
                vision,
                {
                    baseOptions: {
                        modelAssetPath: MODEL_URL,
                        delegate: "GPU"
                    },

                    runningMode: "VIDEO",
                    numHands: 1,

                    minHandDetectionConfidence: 0.3,
                    minHandPresenceConfidence: 0.3,
                    minTrackingConfidence: 0.3
                }
            );

        console.log("MediaPipe READY");

        await startCamera();

        loading.style.display = "none";

        resize();

        createParticles();

        requestAnimationFrame(loop);

    } catch (error) {

        console.error("INIT ERROR:", error);

        loading.innerHTML = `
            <p style="color:red">
                ERROR: ${error.message}
            </p>
        `;
    }
}


// ============================================================
// CAMERA
// ============================================================

async function startCamera() {

    if (video.srcObject) {

        video.srcObject
            .getTracks()
            .forEach(track => track.stop());
    }

    const stream =
        await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: cameraFacing,

                width: {
                    ideal: 1280
                },

                height: {
                    ideal: 720
                }
            },

            audio: false
        });

    video.srcObject = stream;

    await video.play();

    lastVideoTime = -1;
}


// ============================================================
// SWITCH CAMERA
// ============================================================

if (switchCamera) {

    switchCamera.addEventListener(
        "click",
        async () => {

            cameraFacing =
                cameraFacing === "user"
                    ? "environment"
                    : "user";

            try {

                await startCamera();

            } catch (error) {

                console.error(
                    "Camera switch error:",
                    error
                );
            }
        }
    );
}


// ============================================================
// RESIZE
// ============================================================

function resize() {

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}

window.addEventListener(
    "resize",
    resize
);


// ============================================================
// PARTICLE CLASS
// ============================================================

class Particle {

    constructor() {

        this.x = 0;
        this.y = 0;

        this.startX = 0;
        this.startY = 0;

        this.target = {
            x: 0,
            y: 0,
            z: 0
        };

        this.current3D = {
            x: 0,
            y: 0,
            z: 0
        };

        this.size =
            1.2 + Math.random() * 2.2;

        this.alpha =
            0.45 + Math.random() * 0.55;

        this.depth =
            Math.random();

        this.phase =
            Math.random() * Math.PI * 2;

        this.speed =
            0.5 + Math.random() * 1.5;

        this.delay =
            Math.random() * 250;

        this.arc =
            (Math.random() - 0.5) * 80;

        this.twinkle =
            Math.random() * Math.PI * 2;
    }

    update(progress) {

        const eased =
            easeInOutCubic(progress);

        const targetX =
            this.target.x;

        const targetY =
            this.target.y;

        const targetZ =
            this.target.z;

        const wave =
            Math.sin(
                progress * Math.PI
            );

        this.x =
            this.startX +
            (targetX - this.startX) * eased;

        this.y =
            this.startY +
            (targetY - this.startY) * eased;

        // Morphing arc
        this.x +=
            Math.sin(progress * Math.PI) *
            this.arc *
            0.15;

        this.y +=
            Math.cos(progress * Math.PI) *
            this.arc *
            0.08;

        this.current3D.x =
            targetX;

        this.current3D.y =
            targetY;

        this.current3D.z =
            targetZ +
            Math.sin(
                time * 0.002 +
                this.phase
            ) * 5 *
            wave;
    }

    draw() {

        const z =
            this.current3D.z;

        // Perspective
        const perspective =
            1 +
            z / 700;

        const px =
            this.x * perspective;

        const py =
            this.y * perspective;

        const depthScale =
            Math.max(
                0.55,
                Math.min(1.8, perspective)
            );

        const pulse =
            1 +
            Math.sin(
                time * 0.004 +
                this.twinkle
            ) * 0.18;

        const size =
            this.size *
            depthScale *
            pulse;

        const depthAlpha =
            Math.max(
                0.2,
                Math.min(
                    1,
                    0.65 +
                    z / 800
                )
            );

        const alpha =
            this.alpha *
            depthAlpha;

        ctx.globalAlpha = alpha;

        // Outer glow
        ctx.fillStyle = PARTICLE_GLOW;

        ctx.beginPath();

        ctx.arc(
            px,
            py,
            size * 2.8,
            0,
            Math.PI * 2
        );

        ctx.fill();

        // Main particle
        ctx.globalAlpha =
            Math.min(
                1,
                alpha + 0.15
            );

        ctx.fillStyle =
            PARTICLE_COLOR;

        ctx.beginPath();

        ctx.arc(
            px,
            py,
            size,
            0,
            Math.PI * 2
        );

        ctx.fill();

        // Bright center
        ctx.globalAlpha =
            alpha * 0.9;

        ctx.fillStyle =
            "#FFFFFF";

        ctx.beginPath();

        ctx.arc(
            px,
            py,
            size * 0.35,
            0,
            Math.PI * 2
        );

        ctx.fill();

        ctx.globalAlpha = 1;
    }
}


// ============================================================
// PARTICLE CREATION
// ============================================================

function createParticles() {

    particles.length = 0;

    for (
        let i = 0;
        i < PARTICLE_COUNT;
        i++
    ) {

        particles.push(
            new Particle()
        );
    }

    startMorph(
        "circle",
        "circle"
    );
}


// ============================================================
// MORPH
// ============================================================

function startMorph(
    oldGesture,
    newGesture
) {

    const newPoints =
        generateShape(
            newGesture,
            PARTICLE_COUNT
        );

    const oldPoints =
        generateShape(
            oldGesture,
            PARTICLE_COUNT
        );

    for (
        let i = 0;
        i < particles.length;
        i++
    ) {

        const p =
            particles[i];

        const old =
            oldPoints[i];

        const next =
            newPoints[i];

        p.startX =
            p.x ||
            old.x;

        p.startY =
            p.y ||
            old.y;

        p.target = {
            x: next.x,
            y: next.y,
            z: next.z
        };
    }

    morphStartTime =
        performance.now();
}


// ============================================================
// SHAPE GENERATOR
// ============================================================

function generateShape(
    gesture,
    count
) {

    const points = [];

    if (gesture === "circle") {

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const angle =
                (i / count) *
                Math.PI *
                2;

            const radius =
                125 +
                Math.sin(i * 2.7) * 3;

            points.push({
                x:
                    Math.cos(angle) *
                    radius,

                y:
                    Math.sin(angle) *
                    radius,

                z:
                    Math.sin(angle * 3) *
                    15
            });
        }
    }

    else if (gesture === "heart") {

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const t =
                (i / count) *
                Math.PI *
                2;

            const x =
                16 *
                Math.pow(
                    Math.sin(t),
                    3
                );

            const y =
                13 *
                    Math.cos(t) -
                5 *
                    Math.cos(2 * t) -
                2 *
                    Math.cos(3 * t) -
                Math.cos(4 * t);

            points.push({
                x: x * 8,
                y: -y * 8,

                z:
                    Math.sin(t * 2) *
                    18
            });
        }
    }

    else if (gesture === "triangle") {

        const size = 150;

        const vertices = [

            {
                x: 0,
                y: -size
            },

            {
                x: size,
                y: size
            },

            {
                x: -size,
                y: size
            }

        ];

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const edge =
                i % 3;

            const progress =
                Math.floor(i / 3) /
                Math.ceil(count / 3);

            const a =
                vertices[edge];

            const b =
                vertices[
                    (edge + 1) % 3
                ];

            points.push({

                x:
                    a.x +
                    (b.x - a.x) *
                    progress,

                y:
                    a.y +
                    (b.y - a.y) *
                    progress,

                z:
                    Math.sin(
                        progress * Math.PI
                    ) * 15
            });
        }
    }

    else if (gesture === "cube") {

        return generateCube(
            count
        );
    }

    else if (gesture === "chaos") {

        for (
            let i = 0;
            i < count;
            i++
        ) {

            const angle =
                Math.random() *
                Math.PI *
                2;

            const radius =
                60 +
                Math.random() *
                210;

            points.push({

                x:
                    Math.cos(angle) *
                    radius,

                y:
                    Math.sin(angle) *
                    radius,

                z:
                    (Math.random() - 0.5) *
                    300
            });
        }
    }

    return points;
}


// ============================================================
// TRUE 3D CUBE
// ============================================================

function generateCube(count) {

    const points = [];

    const s = 105;

    const vertices = [

        [-s, -s, -s],
        [ s, -s, -s],
        [ s,  s, -s],
        [-s,  s, -s],

        [-s, -s,  s],
        [ s, -s,  s],
        [ s,  s,  s],
        [-s,  s,  s]
    ];

    const edges = [

        [0,1],
        [1,2],
        [2,3],
        [3,0],

        [4,5],
        [5,6],
        [6,7],
        [7,4],

        [0,4],
        [1,5],
        [2,6],
        [3,7]
    ];

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const edgeIndex =
            i % edges.length;

        const edge =
            edges[edgeIndex];

        const a =
            vertices[edge[0]];

        const b =
            vertices[edge[1]];

        const localProgress =
            Math.floor(
                i / edges.length
            ) /
            Math.ceil(
                count /
                edges.length
            );

        points.push({

            x:
                a[0] +
                (b[0] - a[0]) *
                localProgress,

            y:
                a[1] +
                (b[1] - a[1]) *
                localProgress,

            z:
                a[2] +
                (b[2] - a[2]) *
                localProgress
        });
    }

    return points;
}


// ============================================================
// 3D PROJECTION
// ============================================================

function project3D(point) {

    let x = point.x;
    let y = point.y;
    let z = point.z;

    // Y rotation
    const cosY =
        Math.cos(rotationY);

    const sinY =
        Math.sin(rotationY);

    const rotatedX =
        x * cosY -
        z * sinY;

    const rotatedZ =
        x * sinY +
        z * cosY;

    x = rotatedX;
    z = rotatedZ;

    // X rotation
    const cosX =
        Math.cos(rotationX);

    const sinX =
        Math.sin(rotationX);

    const rotatedY =
        y * cosX -
        z * sinX;

    const rotatedZ2 =
        y * sinX +
        z * cosX;

    y = rotatedY;
    z = rotatedZ2;

    const camera =
        520;

    const scale =
        camera /
        (camera - z);

    return {

        x:
            x * scale,

        y:
            y * scale,

        z
    };
}


// ============================================================
// FINGER COUNT
// ============================================================

function distance(a, b) {

    const dx =
        a.x - b.x;

    const dy =
        a.y - b.y;

    const dz =
        (a.z || 0) -
        (b.z || 0);

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}


function countFingers(hand) {

    let count = 0;

    // Index
    if (
        hand[8].y <
        hand[6].y
    ) {
        count++;
    }

    // Middle
    if (
        hand[12].y <
        hand[10].y
    ) {
        count++;
    }

    // Ring
    if (
        hand[16].y <
        hand[14].y
    ) {
        count++;
    }

    // Pinky
    if (
        hand[20].y <
        hand[18].y
    ) {
        count++;
    }

    // Thumb
    const thumbTip =
        hand[4];

    const thumbIP =
        hand[3];

    const indexMCP =
        hand[5];

    const thumbTipDistance =
        distance(
            thumbTip,
            indexMCP
        );

    const thumbIPDistance =
        distance(
            thumbIP,
            indexMCP
        );

    if (
        thumbTipDistance >
        thumbIPDistance * 1.08
    ) {
        count++;
    }

    return count;
}


// ============================================================
// GESTURE MAPPING
// ============================================================

function gestureFromFingers(
    count
) {

    if (count === 0)
        return "circle";

    if (count === 1)
        return "heart";

    if (count === 2)
        return "cube";

    if (count === 3)
        return "triangle";

    if (count === 5)
        return "chaos";

    return currentGesture;
}


// ============================================================
// SMOOTH GESTURE
// ============================================================

function updateGesture(
    detectedGesture
) {

    if (
        detectedGesture !==
        gestureCandidate
    ) {

        gestureCandidate =
            detectedGesture;

        gestureStableFrames = 0;

        return;
    }

    gestureStableFrames++;

    if (
        gestureStableFrames >= 4 &&
        detectedGesture !==
        currentGesture
    ) {

        const previous =
            currentGesture;

        currentGesture =
            detectedGesture;

        startMorph(
            previous,
            currentGesture
        );
    }
}


// ============================================================
// HAND POSITION
// ============================================================

function updateHandPosition(
    hand
) {

    let centerX = 0;
    let centerY = 0;

    for (
        const point of hand
    ) {

        centerX += point.x;
        centerY += point.y;
    }

    centerX /=
        hand.length;

    centerY /=
        hand.length;

    const targetX =
        centerX *
        canvas.width;

    const targetY =
        centerY *
        canvas.height;

    handX +=
        (targetX - handX) *
        0.18;

    handY +=
        (targetY - handY) *
        0.18;
}


// ============================================================
// MAIN LOOP
// ============================================================

function loop() {

    time =
        performance.now();

    if (
        handLandmarker &&
        video.readyState >= 2 &&
        video.currentTime !==
            lastVideoTime
    ) {

        lastVideoTime =
            video.currentTime;

        const results =
            handLandmarker.detectForVideo(
                video,
                performance.now()
            );

        if (
            results.landmarks &&
            results.landmarks.length > 0
        ) {

            const hand =
                results.landmarks[0];

            const fingers =
                countFingers(hand);

            const detectedGesture =
                gestureFromFingers(
                    fingers
                );

            gestureText.textContent =
                detectedGesture
                    .toUpperCase();

            fingerText.textContent =
                `${fingers} fingers`;

            updateGesture(
                detectedGesture
            );

            updateHandPosition(
                hand
            );
        }
        else {

            gestureText.textContent =
                "NO HAND";

            fingerText.textContent =
                "0 fingers";
        }
    }

    drawParticles();

    requestAnimationFrame(loop);
}


// ============================================================
// DRAW PARTICLES
// ============================================================

function drawParticles() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

    // Smooth 3D rotation
    rotationY += 0.006;

    rotationX =
        Math.sin(
            time * 0.0007
        ) * 0.18;

    const elapsed =
        performance.now() -
        morphStartTime;

    const progress =
        Math.min(
            1,
            elapsed /
            MORPH_DURATION
        );

    const centerX =
        handX ||
        canvas.width / 2;

    const centerY =
        handY ||
        canvas.height / 2;

    ctx.save();

    ctx.translate(
        centerX,
        centerY
    );

    for (
        const particle of particles
    ) {

        const projected =
            project3D(
                particle.target
            );

        particle.target.x =
            projected.x;

        particle.target.y =
            projected.y;

        particle.target.z =
            projected.z;

        particle.update(
            progress
        );

        particle.draw();
    }

    ctx.restore();

    // Reset compositing
    ctx.globalAlpha = 1;
}


// ============================================================
// EASING
// ============================================================

function easeInOutCubic(t) {

    return t < 0.5
        ? 4 * t * t * t
        : 1 -
            Math.pow(
                -2 * t + 2,
                3
            ) / 2;
}


// ============================================================
// START
// ============================================================

init();
