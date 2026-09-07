import { splitText } from "./vendor/kugiri.js";

/*
  Every piece of copy on the page carries data-reveal. kugiri cuts each one into the lines the
  browser painted, and each line rises out from under its own mask as it scrolls into view. The
  logo and the case study media carry data-reveal-block instead: there is nothing in them to cut,
  so they arrive whole. Anything that comes into view together and shares a data-reveal-group is
  staggered as one run, whichever of the two it is.
*/

const RISE = 1000;
const FADE = 450;
const STAGGER = 55;
const STAGGER_BUDGET = 600;

// A line travels its own height, which is a distance the reader can see because they are about to
// read across it. A mark or a still has no such measure, and borrowing one would have the logo
// twitch while a case study image lumbered, so they travel a set distance instead, and cover it
// sooner because there is less of it to cover.
const BLOCK_RISE = 700;
const BLOCK_FADE = 400;
const BLOCK_DISTANCE = "0.75rem";

// A line of copy is short enough that the moment it crosses the line there is something to read.
// A case study still is not: its top edge crosses while the rest of it is most of a screen away,
// so a fade that starts there is spent before the reader has anything to look at, and the image
// arrives at full strength like it was never in on it. A block waits for enough of itself to be
// on screen, or for most of itself if it is small — which for a mark the size of the logo comes
// to the same instant it used to.
const BLOCK_VISIBLE = 160;
const RISE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
const FADE_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
const SPLIT_OPTIONS = { type: ["lines"], mask: { lines: "0.3em" } };
const PENDING_CLASS = "text-reveal-pending";
const FONT_BUDGET = 1000;

const splits = new Map();
const revealed = new Set();
const order = new Map();
const resizing = new Set();
let resizeFrame = 0;

function isBlock(target) {
  return target.hasAttribute("data-reveal-block");
}

// Groups nest: the work list sits inside the hero, the contact rows inside let's talk. Taking the
// nearest one would start the inner list from zero, which is what had the first job date landing
// before the name it belongs to. The outermost is what the eye reads as one thing arriving, so a
// run is measured from there and the whole hero cascades once, in the order it is written.
function runOf(target) {
  let run = target;

  for (let el = target.parentElement; el; el = el.parentElement) {
    if (el.hasAttribute("data-reveal-group")) run = el;
  }

  return run;
}

function ready(observation) {
  if (!observation.isIntersecting) return false;
  if (!isBlock(observation.target)) return true;

  const height = observation.boundingClientRect.height;
  return observation.intersectionRect.height >= Math.min(BLOCK_VISIBLE, height * 0.6);
}

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
    splits.set(target, { split: results[index], width: target.clientWidth });

    if (revealed.has(target)) {
      openMasks(results[index].masks);
    }
  });
}

function reveal(targets) {
  const movers = [];
  const masks = [];

  for (const target of targets) {
    if (revealed.has(target)) continue;

    revealed.add(target);
    show(target);

    // A block moves as itself and takes a single turn, where a piece of copy hands over its lines
    // and takes one each. That is what has the logo lead the page by a beat and not by a paragraph.
    if (isBlock(target)) {
      movers.push(target);
      continue;
    }

    const entry = splits.get(target);
    if (!entry) continue;

    masks.push(...entry.split.masks);
    movers.push(...entry.split.lines);
  }

  if (!movers.length) return;

  // At the full gap the hero would spend most of a second staggering, being the intro and the whole
  // work list arriving as one run. The gap closes up as a run lengthens so all of it lands inside
  // the budget, while the short runs that make up the rest of the page keep the spacing the page
  // was tuned to.
  const gap = Math.min(STAGGER, STAGGER_BUDGET / Math.max(1, movers.length - 1));
  const animations = [];

  movers.forEach((mover, step) => {
    const delay = Math.round(step * gap);
    const block = isBlock(mover);

    animations.push(
      mover.animate(
        block
          ? [{ transform: `translateY(${BLOCK_DISTANCE})` }, { transform: "translateY(0)" }]
          : [{ transform: "translateY(110%)" }, { transform: "translateY(0)" }],
        { duration: block ? BLOCK_RISE : RISE, delay, easing: RISE_EASING, fill: "backwards" }
      )
    );

    // Whatever is moving is opaque well before it has finished travelling, so what reads is the
    // rise and not the fade. Both are held back with fill so nothing is on screen before its turn.
    animations.push(
      mover.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: block ? BLOCK_FADE : FADE,
        delay,
        easing: FADE_EASING,
        fill: "backwards",
      })
    );
  });

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
      if (!revealed.has(target)) hide(target);
    }
  });
});

async function init() {
  const targets = Array.from(document.querySelectorAll("[data-reveal], [data-reveal-block]"));
  if (!targets.length) return;

  // Hold the copy back inline before the stylesheet stops doing it, so nothing is painted between
  // the two.
  for (const target of targets) {
    hide(target);
  }
  document.documentElement.classList.remove(PENDING_CLASS);

  // Lines can only be cut against the face the text will be read in, so the split waits on the
  // fonts. A font that is slow is not worth a blank page though, so past the budget the copy is
  // handed back as it is and the reveal is dropped.
  const fonts = document.fonts.ready.then(
    () => true,
    () => true
  );
  const budget = new Promise((resolve) => window.setTimeout(() => resolve(false), FONT_BUDGET));

  if (!(await Promise.race([fonts, budget]))) {
    for (const target of targets) {
      show(target);
    }
    return;
  }

  // Only copy is cut. The blocks wait on the fonts with everything else even though no face of
  // theirs is at stake, because arriving early would put them on screen alone, which is the one
  // thing the reveal is meant to avoid.
  const copy = targets.filter((target) => !isBlock(target));

  try {
    splitAll(copy);
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
        if (!ready(observation)) continue;
        observer.unobserve(observation.target);

        const group = runOf(observation.target);
        const members = arriving.get(group);
        if (members) members.push(observation.target);
        else arriving.set(group, [observation.target]);
      }

      for (const members of arriving.values()) {
        members.sort((a, b) => order.get(a) - order.get(b));
        reveal(members);
      }
    },
    // Crossing the line is the whole story for copy, but a block that is not yet showing enough of
    // itself has to be looked at again as more of it arrives, and an observer only speaks up when a
    // threshold is crossed.
    { rootMargin: "0px 0px -8% 0px", threshold: [0, 0.1, 0.25, 0.5, 0.75] }
  );

  for (const target of targets) {
    observer.observe(target);
  }

  // Only a split has a wrap to lose, so only copy is watched for it.
  for (const target of copy) {
    resizeObserver.observe(target);
  }
}

// The head script adds the class only when it wants a reveal, and takes it away again once it has
// given up waiting for this module. Either way the class still being here is what says the copy is
// hidden and ours to show; without it the page is already painted and best left alone.
if (document.documentElement.classList.contains(PENDING_CLASS)) {
  init();
}
