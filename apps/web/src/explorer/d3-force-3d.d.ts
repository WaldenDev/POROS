// The upstream package has no TypeScript declarations. This is the API subset
// used by the selection interaction, not a replacement physics implementation.
declare module "d3-force-3d" {
  export interface Particle {
    x?: number; y?: number; z?: number;
    vx?: number; vy?: number; vz?: number;
    fx?: number; fy?: number; fz?: number;
  }
  export interface Force<N> {
    (alpha: number): void;
    initialize(nodes: N[], ...args: unknown[]): void;
  }
  export interface Simulation<N> {
    stop(): this;
    tick(iterations?: number): this;
    alphaDecay(value: number): this;
    velocityDecay(value: number): this;
    force(name: string, force: Force<N>): this;
  }
  interface PositionForce<N> extends Force<N> {
    strength(value: number | ((node: N) => number)): this;
  }
  interface LinkForce<N> extends Force<N> {
    id(value: (node: N) => string): this;
    distance(value: number): this;
    strength(value: number): this;
  }
  export function forceSimulation<N extends Particle>(nodes: N[], dimensions?: number): Simulation<N>;
  export function forceX<N>(x: (node: N) => number): PositionForce<N>;
  export function forceY<N>(y: (node: N) => number): PositionForce<N>;
  export function forceZ<N>(z: (node: N) => number): PositionForce<N>;
  export function forceLink<N>(links: {source: string; target: string}[]): LinkForce<N>;
  export function forceCollide<N>(radius: number): Force<N>;
}
