// 3D Star Map using ThreeJS
let scene, camera, renderer, cube, planetsGroup;
const planetPoints = [];
let selectedId = null;

const initThree = () => {
  const container = document.getElementById('three-container');
  if (!container) return;

  // Scene setup
  scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--map-bg').trim() || '#0b0e14');

  // Camera setup
  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  camera.position.set(1500, 1500, 1500);
  camera.lookAt(0, 0, 0);

  // Renderer setup
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  // Planets Group
  planetsGroup = new THREE.Group();
  scene.add(planetsGroup);

  // Add "You Are Here"
  const myX = parseFloat(document.body.dataset.myX) - 500;
  const myY = parseFloat(document.body.dataset.myY) - 500;
  const myZ = parseFloat(document.body.dataset.myZ) - 500;

  const myPlanetGeo = new THREE.SphereGeometry(15, 32, 32);
  const myPlanetMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
  const myPlanet = new THREE.Mesh(myPlanetGeo, myPlanetMat);
  myPlanet.position.set(myX, myY, myZ);
  planetsGroup.add(myPlanet);

  // Pulse effect for current planet
  const pulseGeo = new THREE.SphereGeometry(20, 32, 32);
  const pulseMat = new THREE.MeshBasicMaterial({ 
    color: 0x2ecc71,
    transparent: true,
    opacity: 0.4
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  myPlanet.add(pulse);
  myPlanet.userData.pulse = pulse;

  // Add Neighbor Planets
  document.querySelectorAll('.warp-links a').forEach(link => {
    const x = parseFloat(link.dataset.x) - 500;
    const y = parseFloat(link.dataset.y) - 500;
    const z = parseFloat(link.dataset.z) - 500;
    const id = link.dataset.id;

    const neighborGeo = new THREE.SphereGeometry(8, 16, 16);
    const neighborMat = new THREE.MeshBasicMaterial({ 
      color: 0x4a90e2,
      transparent: true,
      opacity: 0.6
    });
    const neighbor = new THREE.Mesh(neighborGeo, neighborMat);
    neighbor.position.set(x, y, z);
    neighbor.userData = { id, originalColor: 0x4a90e2 };
    planetsGroup.add(neighbor);
    planetPoints.push(neighbor);

    // Add connection line
    const points = [
      new THREE.Vector3(myX, myY, myZ),
      new THREE.Vector3(x, y, z)
    ];
    const lineGeo = new THREE.BufferGeometry().setFromPoints(points);
    const lineMat = new THREE.LineDashedMaterial({
      color: 0x4a90e2,
      dashSize: 20,
      gapSize: 10,
      transparent: true,
      opacity: 0,
    });
    const line = new THREE.Line(lineGeo, lineMat);
    line.computeLineDistances();
    line.userData = { id };
    planetsGroup.add(line);
    planetPoints.push(line);
  });

  // Animation Loop
  const animate = () => {
    requestAnimationFrame(animate);

    // Slow rotation
    planetsGroup.rotation.y += 0.002;
    planetsGroup.rotation.x += 0.001;

    // Pulse animation
    if (myPlanet.userData.pulse) {
      const s = 1 + Math.sin(Date.now() * 0.005) * 0.5;
      myPlanet.userData.pulse.scale.set(s, s, s);
      myPlanet.userData.pulse.material.opacity = 0.4 * (1 - (s - 0.5) / 1);
    }

    renderer.render(scene, camera);
  };

  animate();

  // Handle Resizing
  window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
};

const updateHighlight = (id, isActive) => {
  // Highlight text
  const elements = document.querySelectorAll(`[data-id="${id}"]`);
  elements.forEach((el) => {
    if (isActive) el.classList.add("active");
    else el.classList.remove("active");
  });

  // Highlight parent li
  const link = document.querySelector(`.warp-links a[data-id="${id}"]`);
  if (link) {
    const li = link.closest('li');
    if (isActive) li.classList.add("active");
    else li.classList.remove("active");
  }

  // Highlight 3D Point and Line
  planetPoints.forEach(obj => {
    if (obj.userData.id === id) {
      if (obj.isMesh) { // Sphere
        obj.material.opacity = isActive ? 1 : 0.6;
        obj.scale.set(isActive ? 2 : 1, isActive ? 2 : 1, isActive ? 2 : 1);
        obj.material.color.setHex(isActive ? 0xffffff : 0x4a90e2);
      } else if (obj.isLine) { // Connection Line
        obj.material.opacity = isActive ? 0.6 : 0;
      }
    }
  });
};

// Bidirectional Hover Highlighting
const handleHover = (e) => {
  const item = e.target.closest(".warp-links li");
  if (!item) return;

  const link = item.querySelector('a');
  if (!link) return;

  const id = link.dataset.id;
  const isEnter = e.type === "mouseover" || e.type === "mouseenter";
  
  if (isEnter) {
    // If we're entering a new item, clear the current selected highlight temporarily
    if (selectedId && selectedId !== id) {
      updateHighlight(selectedId, false);
    }
    updateHighlight(id, true);
  } else {
    // If we're leaving, unhighlight current
    updateHighlight(id, false);
    // If we have a selection, restore it
    if (selectedId) {
      updateHighlight(selectedId, true);
    }
  }
};

// Selection and Navigation
const handleClick = (e) => {
  const item = e.target.closest(".warp-links li");
  if (!item) return;

  const link = item.querySelector('a');
  if (!link) return;

  const id = link.dataset.id;

  // If clicking the name of the planet (the link), navigate
  if (e.target === link) {
    return; // Let default browser behavior happen
  }

  // If clicking outside the name (but within li), select it
  e.preventDefault();
  
  if (selectedId && selectedId !== id) {
    updateHighlight(selectedId, false);
  }
  
  selectedId = id;
  updateHighlight(selectedId, true);
};

const initMap = () => {
  initThree();
  const warpRing = document.querySelector(".warp-links");
  if (warpRing) {
    warpRing.addEventListener("mouseover", handleHover);
    warpRing.addEventListener("mouseout", handleHover);
    warpRing.addEventListener("click", handleClick);
  }
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
