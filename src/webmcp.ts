import type { ToolContext } from './tools';
import {
  describeScene, addObject, transformObject, setMaterial, setLighting, frameCamera, scatter,
} from './tools';
import { OBJECT_TYPES } from './factory';
import { LIGHTING_PRESETS } from './scene';

/**
 * Registration of the seven studio tools via the WebMCP imperative API:
 *   document.modelContext.registerTool(...)
 * This module is the ONLY place that talks to document.modelContext.
 * The same implementations are reused by the local dev harness (?agent=1).
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: { readOnlyHint?: boolean };
  run: (ctx: ToolContext, args: Record<string, unknown>) => string;
}

const TYPES = OBJECT_TYPES as unknown as string[];

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'describe_scene',
    description:
      'Read the full current state of the 3D scene: every object (id, name, type, position, rotation, scale, color), ' +
      'the camera pose and the active lighting preset. Call this FIRST whenever you need to know what already exists, ' +
      'before modifying anything, and after changes to verify your work. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: {
          type: 'object',
          description: 'Optional filter to narrow the listing.',
          properties: {
            type: { type: 'string', enum: TYPES, description: 'Only list objects of this type.' },
            id_or_name: { type: 'string', description: 'Only list the object with this id (e.g. "obj_3") or name.' },
          },
        },
      },
    },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => describeScene(ctx, args),
  },
  {
    name: 'add_object',
    description:
      'Add one object to the scene. Use for primitives (box, sphere, cylinder, plane) and furniture presets ' +
      '(tree, rock, lamp, window, chair, table). Objects pop in animated at the given position. ' +
      'Returns the new object id — use it to target the object later.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'The kind of object to add.' },
        position: {
          type: 'object',
          description: 'Ground position. Omit to auto-place near the scene center.',
          properties: {
            x: { type: 'number', description: 'World x, range about -38..38.' },
            z: { type: 'number', description: 'World z, range about -38..38.' },
          },
        },
        scale: {
          type: ['number', 'object'],
          description: 'Uniform scale factor (1 = normal size), or {x,y,z} for non-uniform.',
          properties: {
            x: { type: 'number' }, y: { type: 'number' }, z: { type: 'number' },
          },
        },
        rotation_y: { type: 'number', description: 'Rotation around the vertical axis, in degrees.' },
        name: { type: 'string', description: 'Short human-readable name (e.g. "reading lamp"). Helps later targeting.' },
      },
      required: ['type'],
    },
    run: (ctx, args) => addObject(ctx, args),
  },
  {
    name: 'transform_object',
    description:
      'Move, rotate or scale one or more existing objects. Accepts a single id/name or an array for batch edits. ' +
      'Rotations are in degrees. Use describe_scene first to learn ids and current values.',
    inputSchema: {
      type: 'object',
      properties: {
        targets: {
          type: ['string', 'array'],
          description: 'Object id (e.g. "obj_3") or name — or an array of those to edit many at once.',
          items: { type: 'string' },
        },
        op: { type: 'string', enum: ['move', 'rotate', 'scale'], description: 'Which transform to change.' },
        mode: {
          type: 'string',
          enum: ['absolute', 'relative'],
          description: 'absolute = set to the given value; relative = add/multiply onto the current value.',
        },
        x: { type: 'number', description: 'move: world x or delta x. rotate: degrees around x. scale: x factor.' },
        y: { type: 'number', description: 'move: height or delta y. rotate: degrees around y (turn left/right). scale: y factor.' },
        z: { type: 'number', description: 'move: world z or delta z. rotate: degrees around z. scale: z factor.' },
        uniform: { type: 'number', description: 'scale only: one factor for all axes.' },
      },
      required: ['targets', 'op'],
    },
    run: (ctx, args) => transformObject(ctx, args),
  },
  {
    name: 'set_material',
    description:
      'Change the look of one or more objects: color, roughness (matte<->smooth), metalness, emissive glow and opacity. ' +
      'Use emissive for things that glow at night (lamp heads, windows). Colors are hex strings like "#5d7c5a".',
    inputSchema: {
      type: 'object',
      properties: {
        targets: {
          type: ['string', 'array'],
          description: 'Object id, name, or array of those.',
          items: { type: 'string' },
        },
        color: { type: 'string', description: 'Base color as hex, e.g. "#c97b6d".' },
        roughness: { type: 'number', minimum: 0, maximum: 1, description: '0 = glossy mirror, 1 = fully matte.' },
        metalness: { type: 'number', minimum: 0, maximum: 1, description: '0 = dielectric, 1 = metal.' },
        emissive: { type: 'string', description: 'Glow color as hex, e.g. "#ffb45e". Use for lamps/glass.' },
        emissive_intensity: { type: 'number', minimum: 0, maximum: 5, description: 'Strength of the glow; 0 turns it off.' },
        opacity: { type: 'number', minimum: 0, maximum: 1, description: '1 = solid, lower = transparent.' },
      },
      required: ['targets'],
    },
    run: (ctx, args) => setMaterial(ctx, args),
  },
  {
    name: 'set_lighting',
    description:
      'Set the mood of the whole scene with one call: sky, fog, sun and ambient light transition smoothly. ' +
      'Presets: golden_hour (warm sunset), night_neon (dark + cyan/magenta accents), studio (neutral bright), ' +
      'overcast (soft grey), moonlit (cool blue night). Use intensity to dim or boost.',
    inputSchema: {
      type: 'object',
      properties: {
        preset: { type: 'string', enum: LIGHTING_PRESETS as unknown as string[], description: 'The lighting mood.' },
        intensity: { type: 'number', minimum: 0, maximum: 2, description: '1 = normal, 0.5 = dimmer, 1.5 = brighter.' },
        azimuth: {
          type: 'number',
          description: 'Optional main-light direction around the scene, degrees. 0 = +x (east), 90 = +z.',
        },
      },
      required: ['preset'],
    },
    run: (ctx, args) => setLighting(ctx, args),
  },
  {
    name: 'frame_camera',
    description:
      'Fly the user’s camera to a composed shot of the whole scene or one object. Animated, not a hard cut. ' +
      'Use after building something so the user sees it, or for storytelling angles. ' +
      'The user can grab the camera at any time and overrides this.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'An object id/name, or "scene" for the whole scene.' },
        angle: {
          type: 'string',
          enum: ['front', 'side', 'top', 'three_quarter', 'low', 'hero'],
          description: 'three_quarter is a safe default; hero is a low dramatic close shot.',
        },
        distance: { type: 'number', minimum: 1, maximum: 80, description: 'Camera distance in meters. Omit to auto-frame.' },
        focal_length: {
          type: 'number',
          minimum: 14,
          maximum: 200,
          description: '35mm-equivalent focal length; 35 = wide, 85 = portrait compression. Omit to keep current fov.',
        },
      },
    },
    run: (ctx, args) => frameCamera(ctx, args),
  },
  {
    name: 'scatter',
    description:
      'The power tool: distribute many copies of one type across a rectangular area with natural variation — ' +
      'forests, boulder fields, lantern rows. Supports exclusion_zones to keep paths, buildings or seating clear. ' +
      'Instances appear in a staggered animation. Use instead of many add_object calls.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'What to scatter (usually tree, rock or lamp).' },
        count: { type: 'number', minimum: 1, maximum: 200, description: 'How many instances to place.' },
        area: {
          type: 'object',
          description: 'Rectangle to fill. Default: 10x10 around the center.',
          properties: {
            center_x: { type: 'number', description: 'Center of the area, world x.' },
            center_z: { type: 'number', description: 'Center of the area, world z.' },
            width: { type: 'number', description: 'Extent along x.' },
            depth: { type: 'number', description: 'Extent along z.' },
          },
        },
        jitter: { type: 'number', minimum: 0, maximum: 1, description: '0 = tidy grid, 1 = fully random look. Default 0.75.' },
        scale_variance: { type: 'number', minimum: 0, maximum: 1, description: 'How much instance sizes vary. Default 0.2.' },
        rotation_variance: { type: 'number', minimum: 0, maximum: 1, description: 'Random turning, 0..1. Default 1.' },
        exclusion_zones: {
          type: 'array',
          description: 'Rectangles that must stay empty — paths, ponds, seating areas.',
          items: {
            type: 'object',
            properties: {
              x: { type: 'number', description: 'Zone center, world x.' },
              z: { type: 'number', description: 'Zone center, world z.' },
              width: { type: 'number', description: 'Zone extent along x.' },
              depth: { type: 'number', description: 'Zone extent along z.' },
            },
            required: ['x', 'z', 'width', 'depth'],
          },
        },
      },
      required: ['type', 'count'],
    },
    run: (ctx, args) => scatter(ctx, args),
  },
];

export type ToolLogger = (tool: string, args: Record<string, unknown>, result: string) => void;

/**
 * Registers all tools. Returns the number of tools successfully registered,
 * or 0 when WebMCP is unavailable (browser without the API / flag disabled).
 */
export async function registerTools(ctx: ToolContext, log: ToolLogger): Promise<number> {
  const mc = document.modelContext;
  if (!mc) return 0;

  let registered = 0;
  const controller = new AbortController(); // owning the lifecycle; tools live for the page's lifetime

  for (const def of TOOL_DEFS) {
    try {
      await mc.registerTool(
        {
          name: def.name,
          description: def.description,
          inputSchema: def.inputSchema,
          ...(def.annotations ? { annotations: def.annotations } : {}),
          execute: (input, execCtx) => {
            void execCtx;
            let result: string;
            try {
              result = def.run(ctx, input ?? {});
            } catch (e) {
              result = JSON.stringify({ ok: false, error: `Tool "${def.name}" failed: ${e instanceof Error ? e.message : String(e)}` });
            }
            log(def.name, input ?? {}, result);
            return result;
          },
        },
        { signal: controller.signal },
      );
      registered++;
    } catch (e) {
      console.error(`WebMCP: failed to register tool ${def.name}`, e);
    }
  }

  console.info(
    `WebMCP: ${registered} tools registered — ${TOOL_DEFS.map((t) => t.name).join(', ')}`,
  );
  return registered;
}

/** Dispatch a tool directly (used by the local dev harness). */
export function dispatchTool(ctx: ToolContext, name: string, args: Record<string, unknown>, log: ToolLogger): string {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) {
    return JSON.stringify({ ok: false, error: `Unknown tool "${name}". Available: ${TOOL_DEFS.map((t) => t.name).join(', ')}` });
  }
  let result: string;
  try {
    result = def.run(ctx, args ?? {});
  } catch (e) {
    result = JSON.stringify({ ok: false, error: `Tool "${name}" failed: ${e instanceof Error ? e.message : String(e)}` });
  }
  log(name, args ?? {}, result);
  return result;
}
