import { splitText } from "./vendor/kugiri.js";

/*
  Every piece of copy on the page carries data-reveal. kugiri cuts each one into the lines the
  browser painted, and each line rises out from under its own mask as it scrolls into view. Copy
  that comes into view together and shares a data-reveal-group is staggered as one block.
*/

const RISE = 1000;
const FADE = 450;
const STAGGER = 55;
const RISE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FADE_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
const SPLIT_OPTIONS = { type: ["lines"], mask: { lines: "0.3em" } };
const PENDING_CLASS = "text-reveal-pending";

const splits = new Map();
const order = new Map();
const resizing = new Set();
let resizeFrame = 0;

function hide(target) {
  target.style.opacity = "0";
  target.style.pointerEvents = "none";
}

function show(target) {
  target.style.opacity = "";
  target.style.pointerEvents = "";
}

// A mask clips at rest too, so the focus rings and descenders it would cut need it dropped once
// the reveal is over.
function openMasks(masks) {
  for (const mask of masks) {
    mask.style.clipPath = "none";
  }
}

function splitAll(targets) {
  const results = splitText(targets, SPLIT_OPTIONS);

  targets.forEach((target, index) => {
    const previous = splits.get(target);
    const revealed = previous ? previous.revealed : false;

    splits.set(target, { split: results[index], width: target.clientWidth, revealed });

    if (revealed) {
      openMasks(results[index].masks);
    }
  });
}

function reveal(targets) {
  const animations = [];
  const masks = [];
  let step = 0;

  for (const target of targets) {
    const entry = splits.get(target);
    if (!entry || entry.revealed) continue;

    entry.revealed = true;
    show(target);
    masks.push(...entry.split.masks);

    for (const line of entry.split.lines) {
      // The line is opaque well before it has finished travelling, so what reads is the rise and
      // not the fade. Both are held back with fill so a line is hidden until its turn.
      const delay = step++ * STAGGER;

      animations.push(
        line.animate([{ transform: "translateY(110%)" }, { transform: "translateY(0)" }], {
          duration: RISE,
          delay,
          easing: RISE_EASING,
          fill: "backwards",
        })
      );

      animations.push(
        line.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: FADE,
          delay,
          easing: FADE_EASING,
          fill: "backwards",
        })
      );
    }
  }

  if (!animations.length) return;

  const drop = () => openMasks(masks);
  Promise.all(animations.map((animation) => animation.finished)).then(drop, drop);
}

// A split is the layout the text had when it ran, so a column that changes width has to be reverted
// and split again. Height changes move no wrap, and the re-split carries no reveal: whatever was
// already shown stays shown.
const resizeObserver = new ResizeObserver((observations) => {
  for (const observation of observations) {
    const entry = splits.get(observation.target);
    if (!entry || observation.target.clientWidth === entry.width) continue;

    entry.width = observation.target.clientWidth;
    resizing.add(observation.target);
  }

  if (!resizing.size) return;

  cancelAnimationFrame(resizeFrame);
  resizeFrame = requestAnimationFrame(() => {
    const targets = Array.from(resizing);
    resizing.clear();

    for (const target of targets) {
      splits.get(target).split.revert();
    }

    splitAll(targets);

    for (const target of targets) {
      if (!splits.get(target).revealed) hide(target);
    }
  });
});

async function init() {
  const targets = Array.from(document.querySelectorAll("[data-reveal]"));
  if (!targets.length) return;

  // Hold the copy back inline before the stylesheet stops doing it, so nothing is painted between
  // the two.
  for (const target of targets) {
    hide(target);
  }
  document.documentElement.classList.remove(PENDING_CLASS);

  try {
    await document.fonts.ready;
  } catch {
    // A font that never resolves is still worth splitting for.
  }

  try {
    splitAll(targets);
  } catch (error) {
    for (const target of targets) {
      show(target);
    }
    console.error("kugiri could not split the page:", error);
    return;
  }

  targets.forEach((target, index) => order.set(target, index));

  // Each block is watched on its own, so nothing is ever revealed below the fold. The blocks that
  // cross the line together arrive in one callback, and the ones among them that share a group are
  // staggered as a single run.
  const observer = new IntersectionObserver(
    (observations) => {
      const arriving = new Map();

      for (const observation of observations) {
        if (!observation.isIntersecting) continue;
        observer.unobserve(observation.target);

        const group = observation.target.closest("[data-reveal-group]") || observation.target;
        const members = arriving.get(group);
        if (members) members.push(observation.target);
        else arriving.set(group, [observation.target]);
      }

      for (const members of arriving.values()) {
        members.sort((a, b) => order.get(a) - order.get(b));
        reveal(members);
      }
    },
    { rootMargin: "0px 0px -8% 0px" }
  );

  for (const target of targets) {
    observer.observe(target);
    resizeObserver.observe(target);
  }
}

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
  document.documentElement.classList.remove(PENDING_CLASS);
} else {
  init();
}
