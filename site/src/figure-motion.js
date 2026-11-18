// Character-local motion corrections. No scene geometry, camera or lighting changes.
import * as THREE from 'three';

const wrap = (t, period) => ((t % period) + period) % period;

// Crossfade the final 1.5 s into the first 1.5 s. The resulting period is D-1.5.
// At the wrap, both sides sample the SAME source pose D-1.5. Smoothstep gives
// zero weight derivative at both blend boundaries; ordinary motion remains live.
export function loopWithOverlap(mixer, clip, overlap = 1.5) {
  const period = clip.duration - overlap;
  const a = mixer.clipAction(clip), b = mixer.clipAction(clip.clone());
  for (const action of [a, b]) { action.play(); action.paused = true; }
  return {
    period, overlap,
    sample(time) {
      const t = wrap(time, period);
      if (t < overlap) {
        const u = t / overlap, w = u * u * (3 - 2 * u);
        a.time = period + t; b.time = t;
        a.setEffectiveWeight(1 - w); b.setEffectiveWeight(w);
      } else {
        a.time = t; b.time = 0;
        a.setEffectiveWeight(1); b.setEffectiveWeight(0);
      }
      mixer.update(0);
      return t;
    },
  };
}

// Half-speed sampling plus an upper-body blend toward a relaxed reference pose.
// Keep the base Spine unchanged: this rig parents both thighs to it.
// Only Spine1/2 and the upper chain are damped; foot/root compensation stays intact.
export function restrainedGesture(root, amount = 0.4) {
  const bones = [];
  root.traverse(b => {
    if (b.isBone && /_(Spine[12]|Neck|Head|[LR]_(Clavicle|UpperArm|Forearm|Hand|Finger))/.test(b.name)) {
      bones.push({ bone: b, position: b.position.clone(), quaternion: b.quaternion.clone(),
        sampledPosition: b.position.clone(), sampledQuaternion: b.quaternion.clone() });
    }
  });
  const apply = () => {
    for (const { bone, position, quaternion, sampledPosition, sampledQuaternion } of bones) {
      sampledPosition.copy(bone.position); sampledQuaternion.copy(bone.quaternion);
      bone.position.lerpVectors(position, bone.position, amount);
      bone.quaternion.slerp(quaternion, 1 - amount);
    }
  };
  // AnimationMixer may skip writing unchanged values. Restore its last raw pose
  // first so repeated deterministic renders do not compound the damping.
  apply.restore = () => {
    for (const { bone, sampledPosition, sampledQuaternion } of bones) {
      bone.position.copy(sampledPosition); bone.quaternion.copy(sampledQuaternion);
    }
  };
  return apply;
}
