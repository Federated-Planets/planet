// 3D Star Map using ThreeJS
let scene, camera, renderer, planetsGroup;
const planetPoints = [];
const shipPoints = [];
let selectedId = null;

const initThree = () => {
  const container = document.getElementById('three-container');
  if (!container) return;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(getComputedStyle(document.documentElement).getPropertyValue('--map-bg').trim() || '#0b0e14');

  const width = container.clientWidth;
  const height = container.clientHeight;
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 5000);
  camera.position.set(1500, 1500, 1500);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(window.devicePixelRatio);
  container.appendChild(renderer.domElement);

  planetsGroup = new THREE.Group();
  scene.add(planetsGroup);

  const myX = parseFloat(document.body.dataset.myX) - 500;
  const myY = parseFloat(document.body.dataset.myY) - 500;
  const myZ = parseFloat(document.body.dataset.myZ) - 500;

  const myPlanetGeo = new THREE.SphereGeometry(15, 32, 32);
  const myPlanetMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71 });
  const myPlanet = new THREE.Mesh(myPlanetGeo, myPlanetMat);
  myPlanet.position.set(myX, myY, myZ);
  planetsGroup.add(myPlanet);

  const pulseGeo = new THREE.SphereGeometry(20, 32, 32);
  const pulseMat = new THREE.MeshBasicMaterial({ 
    color: 0x2ecc71,
    transparent: true,
    opacity: 0.4
  });
  const pulse = new THREE.Mesh(pulseGeo, pulseMat);
  myPlanet.add(pulse);
  myPlanet.userData.pulse = pulse;

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

  // Add Active Ships from Traffic
  const shipsData = JSON.parse(container.dataset.ships || '[]');
  shipsData.forEach(ship => {
      const ox = ship.originCoords.x - 500;
      const oy = ship.originCoords.y - 500;
      const oz = ship.originCoords.z - 500;
      const dx = ship.destCoords.x - 500;
      const dy = ship.destCoords.y - 500;
      const dz = ship.destCoords.z - 500;

      // Travel line
      const linePoints = [new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz)];
      const lineGeo = new THREE.BufferGeometry().setFromPoints(linePoints);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x4fc3f7, transparent: true, opacity: 0.7 });
      const travelLine = new THREE.Line(lineGeo, lineMat);
      planetsGroup.add(travelLine);

      // Ship mesh
      const shipGeo = new THREE.TetrahedronGeometry(10);
      const shipMat = new THREE.MeshBasicMaterial({ color: 0xf1c40f });
      const shipMesh = new THREE.Mesh(shipGeo, shipMat);

      shipMesh.userData = {
          start: ship.rawPlan.start_timestamp,
          end: ship.rawPlan.end_timestamp,
          ox, oy, oz, dx, dy, dz
      };

      planetsGroup.add(shipMesh);
      shipPoints.push(shipMesh);
  });

  const animate = () => {
    requestAnimationFrame(animate);

    planetsGroup.rotation.y += 0.002;
    planetsGroup.rotation.x += 0.001;

    if (myPlanet.userData.pulse) {
      const s = 1 + Math.sin(Date.now() * 0.005) * 0.5;
      myPlanet.userData.pulse.scale.set(s, s, s);
      myPlanet.userData.pulse.material.opacity = 0.4 * (1 - (s - 0.5) / 1);
    }

    // Dynamic Ship Positioning (Lerp between origin and destination)
    const now = Date.now();
    shipPoints.forEach((s, i) => {
        const { start, end, ox, oy, oz, dx, dy, dz } = s.userData;

        let p = (now - start) / (end - start);
        p = Math.max(0, Math.min(1, p));

        s.position.set(
            ox + (dx - ox) * p,
            oy + (dy - oy) * p,
            oz + (dz - oz) * p
        );
        s.rotation.y += 0.05;
    });

    renderer.render(scene, camera);
  };

  animate();

  window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  });
};

const updateHighlight = (id, isActive) => {
  const elements = document.querySelectorAll(`[data-id="${id}"]`);
  elements.forEach((el) => {
    if (isActive) el.classList.add("active");
    else el.classList.remove("active");
  });

  const link = document.querySelector(`.warp-links a[data-id="${id}"]`);
  if (link) {
    const li = link.closest('li');
    if (isActive) li.classList.add("active");
    else li.classList.remove("active");
  }

  planetPoints.forEach(obj => {
    if (obj.userData.id === id) {
      if (obj.isMesh) {
        obj.material.opacity = isActive ? 1 : 0.6;
        obj.scale.set(isActive ? 2 : 1, isActive ? 2 : 1, isActive ? 2 : 1);
        obj.material.color.setHex(isActive ? 0xffffff : 0x4a90e2);
      } else if (obj.isLine) {
        obj.material.opacity = isActive ? 0.6 : 0;
      }
    }
  });
};

const handleHover = (e) => {
  const item = e.target.closest(".warp-links li");
  if (!item) return;
  const link = item.querySelector('a');
  if (!link) return;
  const id = link.dataset.id;
  const isEnter = e.type === "mouseover" || e.type === "mouseenter";
  if (isEnter) {
    if (selectedId && selectedId !== id) updateHighlight(selectedId, false);
    updateHighlight(id, true);
  } else {
    updateHighlight(id, false);
    if (selectedId) updateHighlight(selectedId, true);
  }
};

const handleClick = (e) => {
  const item = e.target.closest(".warp-links li");
  if (!item) return;
  const link = item.querySelector('a');
  if (!link) return;
  const id = link.dataset.id;
  if (e.target === link) return;
  e.preventDefault();
  if (selectedId && selectedId !== id) updateHighlight(selectedId, false);
  selectedId = id;
  updateHighlight(selectedId, true);
  window.dispatchEvent(new CustomEvent('planetSelected', {
    detail: {
        id: id,
        name: link.dataset.name,
        url: link.href,
        x: parseFloat(link.dataset.x),
        y: parseFloat(link.dataset.y),
        z: parseFloat(link.dataset.z),
        formatted: link.dataset.formatted
    }
  }));
};

const initMap = () => {
  initThree();
  const warpRing = document.querySelector(".warp-links");
  if (warpRing) {
    warpRing.addEventListener("mouseover", handleHover);
    warpRing.addEventListener("mouseout", handleHover);
    warpRing.addEventListener("click", handleClick);
  }
  window.addEventListener('clearSelection', () => {
    if (selectedId) {
        updateHighlight(selectedId, false);
        selectedId = null;
    }
  });
};

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initMap);
} else {
  initMap();
}
