import type { FractureGroundTruthCase } from "./fractureBenchmark";

export const FRACTURE_GROUND_TRUTH: FractureGroundTruthCase[] = [
  {
    file_name: "fracatlas_01_IMG0000019.jpg",
    image_url: "/fracture-samples/fracatlas_01_IMG0000019.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "distal radius fracture",
    fracture_count: 1,
    boxes: [{ x: 45, y: 30, width: 25, height: 20 }]
  },
  {
    file_name: "fracatlas_02_IMG0000025.jpg",
    image_url: "/fracture-samples/fracatlas_02_IMG0000025.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "distal radius and ulna fracture",
    fracture_count: 1,
    boxes: [{ x: 50, y: 75, width: 25, height: 20 }]
  },
  {
    file_name: "fracatlas_03_IMG0000261.jpg",
    image_url: "/fracture-samples/fracatlas_03_IMG0000261.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "distal radius fracture",
    fracture_count: 2,
    boxes: [
      { x: 35, y: 45, width: 20, height: 20 },
      { x: 60, y: 40, width: 25, height: 20 }
    ]
  },
  {
    file_name: "fracatlas_04_IMG0000307.jpg",
    image_url: "/fracture-samples/fracatlas_04_IMG0000307.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "buckle (torus) fracture",
    fracture_count: 2,
    boxes: [
      { x: 35, y: 45, width: 15, height: 15 },
      { x: 65, y: 40, width: 15, height: 15 }
    ]
  },
  {
    file_name: "fracatlas_05_finger.jpg",
    image_url: "/fracture-samples/fracatlas_05_finger.jpg",
    mura_region: "finger",
    fracture: "fracture",
    fracture_type: "avulsion fracture",
    fracture_count: 1,
    boxes: [{ x: 40, y: 25, width: 20, height: 20 }]
  },
  {
    file_name: "fracatlas_06_forearm.jpg",
    image_url: "/fracture-samples/fracatlas_06_forearm.jpg",
    mura_region: "forearm",
    fracture: "fracture",
    fracture_type: "buckle (torus) fracture",
    fracture_count: 1,
    boxes: [{ x: 25, y: 45, width: 30, height: 30 }]
  },
  {
    file_name: "fracatlas_07_shoulder.jpg",
    image_url: "/fracture-samples/fracatlas_07_shoulder.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "proximal humerus fracture",
    fracture_count: 1,
    boxes: [{ x: 35, y: 20, width: 50, height: 55 }]
  },
  {
    file_name: "fracatlas_08_wrist.jpg",
    image_url: "/fracture-samples/fracatlas_08_wrist.jpg",
    mura_region: "wrist",
    fracture: "fracture",
    fracture_type: "buckle (torus) fracture",
    fracture_count: 2,
    boxes: [
      { x: 35, y: 40, width: 25, height: 20 },
      { x: 65, y: 20, width: 30, height: 25 }
    ]
  },
  {
    file_name: "fracatlas_09_IMG0002302.jpg",
    image_url: "/fracture-samples/fracatlas_09_IMG0002302.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "proximal humerus fracture",
    fracture_count: 1,
    boxes: [{ x: 55, y: 25, width: 25, height: 25 }]
  },
  {
    file_name: "fracatlas_10_IMG0002620.jpg",
    image_url: "/fracture-samples/fracatlas_10_IMG0002620.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "clavicle fracture",
    fracture_count: 1,
    boxes: [{ x: 30, y: 15, width: 35, height: 20 }]
  }
];
