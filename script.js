import {
    HandLandmarker,
    FilesetResolver
} from "@mediapipe/tasks-vision";

// ==========================================
// ELEMENT
// ==========================================

const video = document.getElementById("camera");
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const gestureText = document.getElementById("gesture");
const fingerText = document.getElementById("fingerCount");
const loading = document.getElementById("loading");


// ==========================================
// MEDIAPIPE
// ==========================================

const WASM_URL =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22-rc.20250304/wasm";

const MODEL_URL =
    "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

let handLandmarker;
let lastVideoTime = -1;


// ==========================================
// HAND POSITION
// ==========================================

let handX = 0.5;
let handY = 0.5;

const POSITION_SMOOTHING = 0.2;


// ==========================================
// GESTURE
// ==========================================

let currentGesture = "NONE";

let detectedGesture = "NONE";
let gestureFrames = 0;

const GESTURE_CONFIRM_FRAMES = 4;


// ==========================================
// PARTICLES
// ==========================================

const PARTICLE_COUNT = 240;

let particles = [];

let morphing = false;
let morphStart = 0;

const MORPH_DURATION = 700;


// ==========================================
// INIT
// ==========================================

async function init() {

    try {

        console.log("Loading MediaPipe...");

        const vision =
            await FilesetResolver.forVisionTasks(
                WASM_URL
            );

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


        // ==================================
        // CAMERA
        // ==================================

        const stream =
            await navigator.mediaDevices.getUserMedia({

                video: {
                    facingMode: "user",

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


        loading.style.display = "none";

        resize();

        requestAnimationFrame(loop);

    }

    catch (error) {

        console.error(
            "INIT ERROR:",
            error
        );

        loading.innerHTML = `
            <p style="color:red">
                ERROR: ${error.message}
            </p>
        `;
    }
}


// ==========================================
// RESIZE
// ==========================================

function resize() {

    canvas.width =
        window.innerWidth;

    canvas.height =
        window.innerHeight;
}

window.addEventListener(
    "resize",
    resize
);


// ==========================================
// MATH
// ==========================================

function lerp(a, b, t) {

    return a + (b - a) * t;
}

function ease(t) {

    return t < 0.5

        ? 2 * t * t

        : 1 -
          Math.pow(
              -2 * t + 2,
              2
          ) / 2;
}


// ==========================================
// DISTANCE
// ==========================================

function distance(a, b) {

    const dx =
        a.x - b.x;

    const dy =
        a.y - b.y;

    const dz =
        a.z - b.z;

    return Math.sqrt(
        dx * dx +
        dy * dy +
        dz * dz
    );
}


// ==========================================
// FINGER COUNT
// ==========================================

function countFingers(hand) {

    let count = 0;


    // INDEX
    if (
        hand[8].y <
        hand[6].y
    ) {

        count++;
    }


    // MIDDLE
    if (
        hand[12].y <
        hand[10].y
    ) {

        count++;
    }


    // RING
    if (
        hand[16].y <
        hand[14].y
    ) {

        count++;
    }


    // PINKY
    if (
        hand[20].y <
        hand[18].y
    ) {

        count++;
    }


    // THUMB
    const thumbTip =
        hand[4];

    const thumbIP =
        hand[3];

    const thumbBase =
        hand[5];

    if (
        distance(
            thumbTip,
            thumbBase
        )
        >
        distance(
            thumbIP,
            thumbBase
        )
    ) {

        count++;
    }


    return count;
}


// ==========================================
// FINGER → GESTURE
// ==========================================

function getGesture(fingers) {

    switch (fingers) {

        case 0:
            return "CIRCLE";

        case 1:
            return "HEART";

        case 2:
            return "CUBE";

        case 3:
            return "TRIANGLE";

        case 5:
            return "CHAOS";

        default:
            return "NONE";
    }
}


// ==========================================
// GESTURE SMOOTHING
// ==========================================

function updateGesture(newGesture) {

    if (
        newGesture ===
        detectedGesture
    ) {

        gestureFrames++;

    } else {

        detectedGesture =
            newGesture;

        gestureFrames = 0;
    }


    if (
        gestureFrames >=
        GESTURE_CONFIRM_FRAMES
    ) {

        if (
            currentGesture !==
            detectedGesture
        ) {

            const oldGesture =
                currentGesture;

            currentGesture =
                detectedGesture;

            console.log(
                "GESTURE:",
                oldGesture,
                "→",
                currentGesture
            );


            if (
                currentGesture !==
                "NONE"
            ) {

                startMorph(
                    oldGesture,
                    currentGesture
                );
            }
        }
    }
}


// ==========================================
// SHAPE POINTS
// ==========================================

function circlePoints(count) {

    const points = [];

    const radius = 110;

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const angle =
            i /
            count *
            Math.PI *
            2;

        points.push({

            x:
                Math.cos(angle) *
                radius,

            y:
                Math.sin(angle) *
                radius
        });
    }

    return points;
}


// ==========================================
// HEART
// ==========================================

function heartPoints(count) {

    const points = [];

    const scale = 7;

    for (
        let i = 0;
        i < count;
        i++
    ) {

        const t =
            i /
            count *
            Math.PI *
            2;


        const x =
            16 *
            Math.pow(
                Math.sin(t),
                3
            );


        const y =
            -(
                13 *
                    Math.cos(t)

                -
                5 *
                    Math.cos(
                        2 * t
                    )

                -
                2 *
                    Math.cos(
                        3 * t
                    )

                -
                Math.cos(
                    4 * t
                )
            );


        points.push({

            x:
                x * scale,

            y:
                y * scale
        });
    }

    return points;
}


// ==========================================
// TRIANGLE
// ==========================================

function trianglePoints(count) {

    const size = 125;

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


    const points = [];

    const perSide =
        Math.floor(
            count / 3
        );


    for (
        let side = 0;
        side < 3;
        side++
    ) {

        const a =
            vertices[side];

        const b =
            vertices[
                (side + 1) % 3
            ];


        for (
            let i = 0;
            i < perSide;
            i++
        ) {

            const t =
                i / perSide;

            points.push({

                x:
                    lerp(
                        a.x,
                        b.x,
                        t
                    ),

                y:
                    lerp(
                        a.y,
                        b.y,
                        t
                    )
            });
        }
    }

    return points;
}


// ==========================================
// CUBE
// ==========================================

function cubePoints(count) {

    const s = 75;
    const offset = 30;

    const lines = [

        // FRONT
        [[-s, -s], [s, -s]],
        [[s, -s], [s, s]],
        [[s, s], [-s, s]],
        [[-s, s], [-s, -s]],

        // BACK
        [
            [-s + offset, -s - offset],
            [s + offset, -s - offset]
        ],

        [
            [s + offset, -s - offset],
            [s + offset, s - offset]
        ],

        [
            [s + offset, s - offset],
            [-s + offset, s - offset]
        ],

        [
            [-s + offset, s - offset],
            [-s + offset, -s - offset]
        ],

        // CONNECTORS
        [
            [-s, -s],
            [-s + offset, -s - offset]
        ],

        [
            [s, -s],
            [s + offset, -s - offset]
        ],

        [
            [s, s],
            [s + offset, s - offset]
        ],

        [
            [-s, s],
            [-s + offset, s - offset]
        ]
    ];


    const points = [];

    const perLine =
        Math.ceil(
            count /
            lines.length
        );


    for (
        const line
        of lines
    ) {

        const a = {

            x: line[0][0],

            y: line[0][1]
        };


        const b = {

            x: line[1][0],

            y: line[1][1]
        };


        for (
            let i = 0;
            i < perLine;
            i++
        ) {

            const t =
                i /
                perLine;


            points.push({

                x:
                    lerp(
                        a.x,
                        b.x,
                        t
                    ),

                y:
                    lerp(
                        a.y,
                        b.y,
                        t
                    )
            });
        }
    }


    return points;
}


// ==========================================
// RANDOM CHAOS
// ==========================================

function chaosPoints(count) {

    const points = [];

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
            Math.random() *
            180;

        points.push({

            x:
                Math.cos(angle) *
                radius,

            y:
                Math.sin(angle) *
                radius
        });
    }

    return points;
}


// ==========================================
// GET SHAPE
// ==========================================

function getShapePoints(
    gesture
) {

    switch (gesture) {

        case "CIRCLE":
            return circlePoints(
                PARTICLE_COUNT
            );

        case "HEART":
            return heartPoints(
                PARTICLE_COUNT
            );

        case "TRIANGLE":
            return trianglePoints(
                PARTICLE_COUNT
            );

        case "CUBE":
            return cubePoints(
                PARTICLE_COUNT
            );

        case "CHAOS":
            return chaosPoints(
                PARTICLE_COUNT
            );

        default:
            return chaosPoints(
                PARTICLE_COUNT
            );
    }
}


// ==========================================
// PARTICLE CLASS
// ==========================================

class Particle {

    constructor(
        start,
        target
    ) {

        this.startX =
            start.x;

        this.startY =
            start.y;

        this.targetX =
            target.x;

        this.targetY =
            target.y;


        this.x =
            start.x;

        this.y =
            start.y;


        this.size =
            Math.random() *
            2 +
            1;


        this.delay =
            Math.random() *
            0.18;


        this.arc =
            (
                Math.random() -
                0.5
            ) *
            80;


        this.angle =
            Math.random() *
            Math.PI *
            2;
    }


    update(progress) {

        let t =
            (
                progress -
                this.delay
            ) /
            (
                1 -
                this.delay
            );


        t =
            Math.max(
                0,
                Math.min(
                    1,
                    t
                )
            );


        t =
            ease(t);


        this.x =
            lerp(
                this.startX,
                this.targetX,
                t
            );


        this.y =
            lerp(
                this.startY,
                this.targetY,
                t
            );


        // CURVED MOTION
        const curve =
            Math.sin(
                t *
                Math.PI
            );


        this.x +=
            Math.cos(
                this.angle
            ) *
            this.arc *
            curve;


        this.y +=
            Math.sin(
                this.angle
            ) *
            this.arc *
            curve;
    }


    draw() {

        ctx.beginPath();

        ctx.arc(
            this.x,
            this.y,
            this.size,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }
}


// ==========================================
// START MORPH
// ==========================================

function startMorph(
    fromGesture,
    toGesture
) {

    let startPoints;


    // First shape
    if (
        fromGesture ===
        "NONE"
    ) {

        startPoints =
            chaosPoints(
                PARTICLE_COUNT
            );

    }

    else {

        startPoints =
            getShapePoints(
                fromGesture
            );
    }


    const targetPoints =
        getShapePoints(
            toGesture
        );


    particles = [];


    for (
        let i = 0;
        i < PARTICLE_COUNT;
        i++
    ) {

        particles.push(
            new Particle(

                startPoints[
                    i %
                    startPoints.length
                ],

                targetPoints[
                    i %
                    targetPoints.length
                ]
            )
        );
    }


    morphing = true;

    morphStart =
        performance.now();
}


// ==========================================
// UPDATE PARTICLES
// ==========================================

function updateParticles() {

    if (
        particles.length === 0
    ) {

        return;
    }


    const elapsed =
        performance.now() -
        morphStart;


    let progress =
        elapsed /
        MORPH_DURATION;


    progress =
        Math.min(
            1,
            progress
        );


    for (
        const particle
        of particles
    ) {

        particle.update(
            progress
        );
    }


    if (
        progress >= 1
    ) {

        morphing = false;
    }
}


// ==========================================
// DRAW PARTICLES
// ==========================================

function drawParticles() {

    if (
        particles.length === 0
    ) {

        return;
    }


    const centerX =
        handX *
        canvas.width;

    const centerY =
        handY *
        canvas.height;


    ctx.save();

    ctx.translate(
        centerX,
        centerY
    );


    ctx.fillStyle =
        "#00ffcc";

    ctx.shadowColor =
        "#00ffcc";

    ctx.shadowBlur =
        15;


    for (
        const particle
        of particles
    ) {

        particle.draw();
    }


    ctx.restore();
}


// ==========================================
// DRAW HAND LANDMARKS
// ==========================================

function drawLandmarks(hand) {

    ctx.fillStyle =
        "#00ffcc";


    for (
        const point
        of hand
    ) {

        const x =
            point.x *
            canvas.width;

        const y =
            point.y *
            canvas.height;


        ctx.beginPath();

        ctx.arc(
            x,
            y,
            4,
            0,
            Math.PI * 2
        );

        ctx.fill();
    }
}


// ==========================================
// MAIN LOOP
// ==========================================

function loop() {

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );


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
            results.landmarks.length >
                0
        ) {

            const hand =
                results.landmarks[0];


            // ==================================
            // HAND POSITION
            // ==================================

            let targetX = 0;
            let targetY = 0;


            for (
                const point
                of hand
            ) {

                targetX +=
                    point.x;

                targetY +=
                    point.y;
            }


            targetX /=
                hand.length;

            targetY /=
                hand.length;


            handX +=
                (
                    targetX -
                    handX
                ) *
                POSITION_SMOOTHING;


            handY +=
                (
                    targetY -
                    handY
                ) *
                POSITION_SMOOTHING;


            // ==================================
            // FINGER COUNT
            // ==================================

            const fingers =
                countFingers(
                    hand
                );


            const gesture =
                getGesture(
                    fingers
                );


            fingerText.textContent =
                `${fingers} fingers`;


            gestureText.textContent =
                gesture;


            // ==================================
            // GESTURE SMOOTHING
            // ==================================

            updateGesture(
                gesture
            );


            // ==================================
            // DEBUG LANDMARK
            // ==================================

            // Kalau mau lihat titik tangan,
            // uncomment baris berikut:

            // drawLandmarks(hand);

        }

        else {

            gestureText.textContent =
                "NO HAND";

            fingerText.textContent =
                "0 fingers";
        }
    }


    // ==================================
    // PARTICLE SYSTEM
    // ==================================

    updateParticles();

    drawParticles();


    requestAnimationFrame(
        loop
    );
}


// ==========================================
// START
// ==========================================

init();
