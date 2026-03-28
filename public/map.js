// Bidirectional Hover Highlighting
const handleHover = (e) => {
  const item = e.target.closest(".warp-links a, .neighbor-circle, .coord");
  if (!item) return;

  const id = item.dataset.id;
  if (!id) return;

  const isEnter = e.type === "mouseover" || e.type === "mouseenter";
  const elements = document.querySelectorAll(`[data-id="${id}"]`);

  elements.forEach((el) => {
    if (isEnter) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
};

const initMap = () => {
  const warpRing = document.querySelector(".warp-ring");
  if (warpRing) {
    warpRing.addEventListener("mouseover", handleHover);
    warpRing.addEventListener("mouseout", handleHover);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
