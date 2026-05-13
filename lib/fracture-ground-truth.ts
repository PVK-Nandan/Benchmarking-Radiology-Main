import type { FractureGroundTruthCase } from "./fractureBenchmark";

export const FRACTURE_GROUND_TRUTH: FractureGroundTruthCase[] = [
  {
    file_name: "fracatlas_01_IMG0000019.jpg",
    image_url: "/fracture-samples/fracatlas_01_IMG0000019.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "hand/wrist fracture",
    fracture_count: 1,
    boxes: [{ x: 53.92, y: 32.26, width: 11.86, height: 5.12 }]
  },
  {
    file_name: "fracatlas_02_IMG0000025.jpg",
    image_url: "/fracture-samples/fracatlas_02_IMG0000025.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "hand fracture",
    fracture_count: 1,
    boxes: [{ x: 50.92, y: 87.26, width: 5.39, height: 6.66 }]
  },
  {
    file_name: "fracatlas_03_IMG0000261.jpg",
    image_url: "/fracture-samples/fracatlas_03_IMG0000261.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "multiple hand fractures",
    fracture_count: 2,
    boxes: [
      { x: 74.58, y: 35.99, width: 8.29, height: 4.11 },
      { x: 26.72, y: 35.09, width: 7.19, height: 4.27 }
    ]
  },
  {
    file_name: "fracatlas_04_IMG0000307.jpg",
    image_url: "/fracture-samples/fracatlas_04_IMG0000307.jpg",
    mura_region: "hand",
    fracture: "fracture",
    fracture_type: "multiple finger/hand fractures",
    fracture_count: 3,
    boxes: [
      { x: 20.58, y: 47.52, width: 7.33, height: 5.69 },
      { x: 75.91, y: 48.76, width: 7.13, height: 3.63 },
      { x: 66.67, y: 70.79, width: 2.91, height: 3.8 }
    ]
  },
  {
    file_name: "fracatlas_05_IMG0000092.jpg",
    image_url: "/fracture-samples/fracatlas_05_IMG0000092.jpg",
    mura_region: "leg",
    fracture: "fracture",
    fracture_type: "lower-limb fracture",
    fracture_count: 1,
    boxes: [{ x: 46.8, y: 42.33, width: 15.47, height: 4.62 }]
  },
  {
    file_name: "fracatlas_06_IMG0000466.jpg",
    image_url: "/fracture-samples/fracatlas_06_IMG0000466.jpg",
    mura_region: "leg",
    fracture: "fracture",
    fracture_type: "multiple lower-limb fractures",
    fracture_count: 2,
    boxes: [
      { x: 49.6, y: 27.28, width: 5.5, height: 7.89 },
      { x: 57.9, y: 25.72, width: 3.3, height: 7.48 }
    ]
  },
  {
    file_name: "fracatlas_07_IMG0002180.jpg",
    image_url: "/fracture-samples/fracatlas_07_IMG0002180.jpg",
    mura_region: "hip",
    fracture: "fracture",
    fracture_type: "hip/pelvis fracture",
    fracture_count: 1,
    boxes: [{ x: 6.11, y: 41.83, width: 18.28, height: 17.33 }]
  },
  {
    file_name: "fracatlas_08_IMG0003341.jpg",
    image_url: "/fracture-samples/fracatlas_08_IMG0003341.jpg",
    mura_region: "hip",
    fracture: "fracture",
    fracture_type: "multiple hip/pelvis fractures",
    fracture_count: 2,
    boxes: [
      { x: 73.24, y: 84.54, width: 14.73, height: 15.46 },
      { x: 11.15, y: 57.48, width: 14.86, height: 21.55 }
    ]
  },
  {
    file_name: "fracatlas_09_IMG0002302.jpg",
    image_url: "/fracture-samples/fracatlas_09_IMG0002302.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "shoulder/proximal humerus fracture",
    fracture_count: 1,
    boxes: [{ x: 63.76, y: 36.65, width: 11.61, height: 11.26 }]
  },
  {
    file_name: "fracatlas_10_IMG0002620.jpg",
    image_url: "/fracture-samples/fracatlas_10_IMG0002620.jpg",
    mura_region: "shoulder",
    fracture: "fracture",
    fracture_type: "shoulder fracture",
    fracture_count: 1,
    boxes: [{ x: 44.09, y: 20.23, width: 8.31, height: 7.89 }]
  }
];
