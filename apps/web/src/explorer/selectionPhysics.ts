import { forceSimulation, forceLink, forceX, forceY, forceZ, forceCollide,
  type Particle, type Simulation } from "d3-force-3d";
import type { GraphNode } from "./graphData";

type Point = { x: number; y: number; z: number };
type Body = Particle & Point & { id: string; home: Point };
const point = (node: GraphNode): Point => ({ x: node.x ?? 0, y: node.y ?? 0, z: node.z ?? 0 });
const speed = (body: Body) => Math.hypot(body.vx ?? 0, body.vy ?? 0, body.vz ?? 0);
function place(node: GraphNode, at: Point) {
  node.x = node.fx = at.x;
  node.y = node.fy = at.y;
  node.z = node.fz = at.z;
}

// A small, isolated spring system. Its links are interaction constraints only;
// they never enter graphData, evidence, relation counts or exported selections.
export class SelectionPhysics {
  private nodes = new Map<string, GraphNode>();
  private homes = new Map<string, Point>();
  private bodies: Body[] = [];
  private picked = new Set<string>();
  private simulation?: Simulation<Body>;
  private quiet = 0;
  private ticks = 0;
  private dragging = false;
  ready = false;
  active = false;

  initialize(nodes: GraphNode[]) {
    if (this.ready) return;
    this.nodes = new Map(nodes.map(node => [node.id, node]));
    this.homes = new Map(nodes.map(node => [node.id, point(node)]));
    this.ready = true;
  }

  select(ids: Set<string>, reduced = false): boolean {
    if (!this.ready) return false;
    const next = new Set([...ids].filter(id => this.nodes.get(id)?.kind === "repo"));
    if (next.size === this.picked.size && [...next].every(id => this.picked.has(id))) return false;
    const old = new Map(this.bodies.map(body => [body.id, body]));
    this.picked = next;
    // A lone selection has nothing to attract. Previously moved nodes return home.
    const moving = new Set([...old.keys(), ...(next.size > 1 ? next : [])]);
    this.bodies = [...moving].map(id => old.get(id) ?? {
      id, ...point(this.nodes.get(id)!), home: this.homes.get(id)!,
    });
    this.simulation?.stop();
    if (!this.bodies.length) return false;
    const springs: {source: string; target: string}[] = [];
    const selected = [...next];
    for (let i = 0; i < selected.length; i++)
      for (let j = i + 1; j < selected.length; j++)
        springs.push({ source: selected[i], target: selected[j] });
    const strength = (body: Body) => next.size > 1 && next.has(body.id) ? 0.012 : 0.10;
    const collision = forceCollide<Body>(26);
    const selectedBodies = this.bodies.filter(body => next.has(body.id));
    this.simulation = forceSimulation(this.bodies, 3).stop()
      .alphaDecay(0).velocityDecay(0.32)
      .force("tethers", forceLink<Body>(springs).id(body => body.id).distance(78).strength(0.18))
      .force("home-x", forceX<Body>(body => body.home.x).strength(strength))
      .force("home-y", forceY<Body>(body => body.home.y).strength(strength))
      .force("home-z", forceZ<Body>(body => body.home.z).strength(strength))
      .force("spacing", Object.assign((alpha: number) => collision(alpha), {
        initialize: (_nodes: Body[], ...args: unknown[]) => collision.initialize(selectedBodies, ...args),
      }));
    this.wake();
    if (reduced) {
      this.simulation.tick(180);
      this.finish();
    }
    return true;
  }

  private wake() { this.active = true; this.quiet = 0; this.ticks = 0; }
  private publish() {
    for (const body of this.bodies) place(this.nodes.get(body.id)!, body);
  }
  step() {
    if (!this.active || !this.simulation) return;
    this.simulation.tick();
    this.publish();
    this.quiet = this.bodies.every(body => speed(body) < 0.025) ? this.quiet + 1 : 0;
    if (!this.dragging && (++this.ticks >= 150 || this.quiet >= 8)) this.finish();
  }
  finish() {
    for (const body of this.bodies) {
      body.vx = body.vy = body.vz = 0;
      if (this.picked.size < 2 || !this.picked.has(body.id)) Object.assign(body, body.home);
    }
    this.publish();
    this.active = false;
  }
  drag(node: GraphNode) {
    const body = this.bodies.find(item => item.id === node.id);
    if (!body || !this.picked.has(node.id) || this.picked.size < 2) {
      this.homes.set(node.id, point(node));
      if (body) Object.assign(body, point(node), { home: point(node), vx: 0, vy: 0, vz: 0 });
      return;
    }
    Object.assign(body, point(node), { fx: node.x, fy: node.y, fz: node.z });
    this.dragging = true;
    this.wake();
  }
  release(node: GraphNode) {
    const body = this.bodies.find(item => item.id === node.id);
    this.dragging = false;
    if (body) {
      body.fx = body.fy = body.fz = undefined;
      this.wake();
    }
  }
  dispose() {
    this.simulation?.stop();
    for (const body of this.bodies) place(this.nodes.get(body.id)!, body.home);
    this.active = false;
  }
}
