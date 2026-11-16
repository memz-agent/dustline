// The player's body: acceleration and friction on the ground plane, a walk
// key and a crouch that genuinely change the numbers (speed, eye height, the
// noise you make), resolved against the map's boxes with the shared slide
// move. Health and armour live in the match state, not here: this file only
// answers "where is the body and how fast is it going".
import * as THREE from 'three';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.14;
const RADIUS = 0.36;
const RUN_SPEED = 5.4;
const WALK_SPEED = 2.6;
const CROUCH_SPEED = 2.2;
const ACCEL = 46;
const FRICTION = 10;

export function createPlayer(map) {
  const body = {
    position: new THREE.Vector3(0, 0, 16.8),
    velocity: new THREE.Vector3(),
    yaw: 0, // yaw 0 faces -z: north, toward the depot
    pitch: 0,
    eye: EYE_STAND,
    crouching: false,
    walking: false,
    speed: 0,
    stepCycle: 0,
    stepped: false, // set for one step when a foot lands, for sound and noise
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0021) {
    body.yaw -= dx * sensitivity;
    body.pitch = Math.max(-1.45, Math.min(1.45, body.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    body.pitch = Math.min(1.45, body.pitch + pitchKick);
    body.yaw += yawKick;
  }

  function teleport(x, z, yaw) {
    body.position.set(x, 0, z);
    body.velocity.set(0, 0, 0);
    body.yaw = yaw;
    body.pitch = 0;
  }

  function step(dt, keys, speedFactor = 1) {
    body.crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    body.walking = keys.has('ShiftLeft') || keys.has('ShiftRight');
    const eyeTarget = body.crouching ? EYE_CROUCH : EYE_STAND;
    body.eye += (eyeTarget - body.eye) * Math.min(1, dt * 11);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(body.yaw);
      const cos = Math.cos(body.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }
    const topSpeed = (body.crouching ? CROUCH_SPEED : body.walking ? WALK_SPEED : RUN_SPEED) * speedFactor;
    const blend = Math.min(1, (ACCEL * dt) / Math.max(0.1, topSpeed));
    body.velocity.x += (wish.x * topSpeed - body.velocity.x) * blend;
    body.velocity.z += (wish.z * topSpeed - body.velocity.z) * blend;
    if (!wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      body.velocity.x *= damp;
      body.velocity.z *= damp;
    }
    map.slideMove(body.position, body.velocity.x * dt, body.velocity.z * dt, RADIUS);
    body.speed = Math.hypot(body.velocity.x, body.velocity.z);

    // Footsteps: a stride lands every 2.1 m at a run, 1.7 m at a walk.
    body.stepped = false;
    if (body.speed > 0.6) {
      body.stepCycle += body.speed * dt;
      const stride = body.walking || body.crouching ? 1.7 : 2.1;
      if (body.stepCycle >= stride) {
        body.stepCycle = 0;
        body.stepped = true;
      }
    }
    // The noise radius other ears hear this step: running is loud, a crouch
    // walk is nearly silent. Read by main.js after the step.
    body.noiseRadius = body.speed < 0.6 ? 0 : body.crouching ? 2 : body.walking ? 5 : 13;
    body.movingFast = body.speed > 3.4;
    return body;
  }

  return { state: body, step, look, recoil, teleport };
}
