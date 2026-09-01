import type { ToolContext } from './tools';
import {
  describeScene, queryScene, addObject, transformObject, setMaterial, setLighting,
  frameCamera, cameraPath, scatter, snapshotTool, undoTool, setUi,
  deleteObjects, boardSquare, helpTool,
} from './tools';
import { OBJECT_TYPES } from './factory';
import { LIGHTING_PRESETS } from './scene';

/**
 * Registration of the studio tools via the WebMCP imperative API:
 *   document.modelContext.registerTool(...)
 * This module is the ONLY place that talks to document.modelContext.
 * The same implementations are reused by the local dev harness (?agent=1).
 *
 * Every mutating tool automatically captures a snapshot right before it
 * runs, so `undo` can always step back — reversibility as a trust primitive.
 * Annotations describe side effects for hosts and agents.
 */

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
  };
  /** Auto-capture a snapshot before this tool runs. */
  mutating?: boolean;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string> | string;
}

const TYPES = OBJECT_TYPES as unknown as string[];

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'help',
    description:
      'Get the studio playbook: the recommended workflow, all available tools with their key parameters, ' +
      'and worked recipes (build scenes, cinematic camera paths, playing chess). Call this FIRST if anything ' +
      'about driving the scene is unclear. Read-only.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => helpTool(ctx, args),
  },
  {
    name: 'describe_scene',
    description:
      'Read the current state of the 3D scene at a glance: object counts by type, the first objects with id/name/type/position/rotation/scale/color, the camera pose and the active lighting preset. Read-only. For large scenes use query_scene with pagination instead of relying on the truncated list.',
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
    name: 'query_scene',
    description:
      'Query objects with pagination, filters and field selection — the reliable way to see a large scene completely. ' +
      'Returns total/offset/next_offset so you can page through everything. Optional real bounding boxes per object. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'Only objects of this type.' },
        name_contains: { type: 'string', description: 'Case-insensitive substring match on object names.' },
        id_or_name: { type: 'string', description: 'A single object by id or name.' },
        fields: {
          type: 'array',
          description: 'Limit payload: which sections to include. Default: everything.',
          items: { type: 'string', enum: ['pose', 'material'] },
        },
        limit: { type: 'number', minimum: 1, maximum: 200, description: 'Page size. Default 40.' },
        offset: { type: 'number', minimum: 0, description: 'Skip this many matches. Use next_offset from the previous page.' },
        include_bounds: { type: 'boolean', description: 'Include real world-space bounding box [minX,minY,minZ,maxX,maxY,maxZ] per object.' },
      },
    },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => queryScene(ctx, args),
  },
  {
    name: 'add_object',
    description:
      'Add one object to the scene. Use for primitives (box, sphere, cylinder, plane), furniture presets ' +
      '(tree, rock, lamp, window, chair, table) and game pieces (chessboard, chess_piece). Objects pop in ' +
      'animated at the given position. Returns the new object id — use it to target the object later. ' +
      'Tip for chess: name pieces after their square, e.g. "white pawn e2".',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: TYPES, description: 'The kind of object to add.' },
        piece: {
          type: 'string',
          enum: ['pawn', 'rook', 'knight', 'bishop', 'queen', 'king'],
          description: 'chess_piece only: which piece shape (default pawn).',
        },
        side: {
          type: 'string',
          enum: ['white', 'black'],
          description: 'chess_piece only: piece colorway (default white).',
        },
        position: {
          type: 'object',
          description: 'Ground position. Omit to auto-place near the scene center.',
          properties: {
            x: { type: 'number', description: 'World x, range about -58..58.' },
            z: { type: 'number', description: 'World z, range about -58..58.' },
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
    annotations: { idempotentHint: false },
    mutating: true,
    run: (ctx, args) => addObject(ctx, args),
  },
  {
    name: 'transform_object',
    description:
      'Move, rotate or scale one or more existing objects. Accepts a single id/name or an array for batch edits. ' +
      'Rotations are in degrees. Waits until the animated transition has settled, then reports the resulting live ' +
      'positions. Use describe_scene first to learn ids and current values.',
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
    annotations: { idempotentHint: false },
    mutating: true,
    run: (ctx, args) => transformObject(ctx, args),
  },
  {
    name: 'set_material',
    description:
      'Change the look of one or more objects: color, roughness (matte<->smooth), metalness, emissive glow and opacity. ' +
      'Use emissive for things that glow at night (lamp heads, windows). Colors are hex strings like "#5d7c5a". ' +
      'Setting the same values repeatedly is safe.',
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
    annotations: { idempotentHint: true },
    mutating: true,
    run: (ctx, args) => setMaterial(ctx, args),
  },
  {
    name: 'set_lighting',
    description:
      'Set the mood of the whole scene with one call: sky, fog, sun and ambient light transition smoothly. ' +
      'Presets: golden_hour (warm sunset), night_neon (dark + cyan/magenta accents), studio (neutral bright), ' +
      'overcast (soft grey), moonlit (cool blue night). Use intensity to dim or boost. Same inputs reproduce the same mood.',
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
    annotations: { idempotentHint: true },
    mutating: true,
    run: (ctx, args) => setLighting(ctx, args),
  },
  {
    name: 'frame_camera',
    description:
      'Fly the user’s camera to a composed shot of the whole scene or one object. The move animates for about one ' +
      'second and the tool result reports the pose only after it settled. Use after building something so the user ' +
      'sees it, or for single shots. For sequences of shots use camera_path instead. ' +
      'If the user grabs the camera mid-flight, the result says so.',
    inputSchema: {
      type: 'object',
      properties: {
        target: { type: 'string', description: 'An object id/name, or "scene" for the whole scene.' },
        angle: {
          type: 'string',
          enum: ['front', 'side', 'top', 'three_quarter', 'low', 'hero'],
          description: 'three_quarter is a safe default; hero is a low dramatic close shot.',
        },
        distance: { type: 'number', minimum: 1, maximum: 90, description: 'Camera distance in meters. Omit to auto-frame.' },
        focal_length: {
          type: 'number',
          minimum: 14,
          maximum: 200,
          description: '35mm-equivalent focal length; 35 = wide, 85 = portrait compression. Omit to keep current fov.',
        },
        select: {
          type: 'boolean',
          description: 'Also select the target object (shows its outline). Default true; pass false for clean cinematic frames.',
        },
        easing: { type: 'string', enum: ['smooth', 'cinematic', 'linear'], description: 'Flight feel. Default smooth.' },
      },
    },
    annotations: { idempotentHint: true },
    run: (ctx, args) => frameCamera(ctx, args),
  },
  {
    name: 'camera_path',
    description:
      'Direct a camera sequence: fly through 2-12 keyframed shots, holding on each — a real camera move, not a single cut. ' +
      'Use to tour a build, reveal a scene, or orbit drama around an object. Plays once by default; the result reports ' +
      'each completed shot after the whole path settled. The user grabbing the camera interrupts gracefully (reported). ' +
      'For cinema, pair with set_ui {visible:false} beforehand.',
    inputSchema: {
      type: 'object',
      properties: {
        keyframes: {
          type: 'array',
          description: 'The shots in order. Each: {target, angle?, distance?, focal_length?, duration_ms?, hold_ms?}.',
          items: {
            type: 'object',
            properties: {
              target: { type: 'string', description: 'Object id/name or "scene".' },
              angle: {
                type: 'string',
                enum: ['front', 'side', 'top', 'three_quarter', 'low', 'hero'],
                description: 'Shot angle. Default three_quarter.',
              },
              distance: { type: 'number', minimum: 1, maximum: 90, description: 'Camera distance. Omit to auto-frame.' },
              focal_length: { type: 'number', minimum: 14, maximum: 200, description: '35mm-equivalent focal length.' },
              duration_ms: { type: 'number', description: 'Flight time to this shot, ms (300-4000). Default ~950.' },
              hold_ms: { type: 'number', description: 'Pause on this shot, ms (0-5000). Default 800.' },
            },
            required: ['target'],
          },
        },
        easing: { type: 'string', enum: ['smooth', 'cinematic', 'linear'], description: 'Flight feel. Default cinematic.' },
        loop: { type: 'boolean', description: 'Replay the path (max 3 loops). Default false.' },
        segment_ms: { type: 'number', minimum: 300, maximum: 4000, description: 'Default flight time for all keyframes.' },
      },
      required: ['keyframes'],
    },
    annotations: { idempotentHint: false },
    run: (ctx, args) => cameraPath(ctx, args),
  },
  {
    name: 'scatter',
    description:
      'The power tool: distribute many copies of one type across a rectangular area with natural variation — ' +
      'forests, boulder fields, lantern rows. exclusion_zones keep paths/seating clear; avoid_object_ids dodge ' +
      'existing objects (with real bounding boxes when footprint="actual_bounds"). Pass a seed to reproduce the exact ' +
      'same layout later. Instances appear in a staggered animation. Use instead of many add_object calls.',
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
        avoid_object_ids: {
          type: 'array',
          description: 'Keep clear of these existing objects (ids or names).',
          items: { type: 'string' },
        },
        footprint: {
          type: 'string',
          enum: ['pad', 'actual_bounds'],
          description: 'pad = fixed safety margin around each avoided object; actual_bounds = real bounding box. Default pad.',
        },
        seed: { type: 'number', description: 'RNG seed for reproducible layouts. Omit to get a random one (returned in the result).' },
      },
      required: ['type', 'count'],
    },
    annotations: { idempotentHint: true },
    mutating: true,
    run: (ctx, args) => scatter(ctx, args),
  },
  {
    name: 'set_ui',
    description:
      'Show or hide the studio HUD (tool log, panels, hints) for a clean cinematic view. Hide it before camera_path ' +
      'showpieces or final beauty shots; show it again when returning to interactive editing. The user can always ' +
      'press H to toggle. Does not change the scene itself.',
    inputSchema: {
      type: 'object',
      properties: {
        visible: { type: 'boolean', description: 'true = show the HUD, false = hide it (cinematic).' },
      },
      required: ['visible'],
    },
    annotations: { idempotentHint: true },
    run: (ctx, args) => setUi(ctx, args),
  },
  {
    name: 'delete_objects',
    description:
      'Remove one or many objects at once — by explicit targets, or by filter: type and/or name_contains. ' +
      'This is how to clear a whole group (“delete all pawns” → {name_contains: "pawn"}). Objects shrink out ' +
      'animated; the removal is undoable (auto restore-point). The result lists every deleted id.',
    inputSchema: {
      type: 'object',
      properties: {
        targets: {
          type: ['string', 'array'],
          description: 'Explicit object id(s)/name(s) to delete.',
          items: { type: 'string' },
        },
        type: { type: 'string', enum: TYPES, description: 'Delete all objects of this type (combine with name_contains).' },
        name_contains: { type: 'string', description: 'Delete every object whose name contains this, e.g. "pawn".' },
      },
    },
    annotations: { destructiveHint: true },
    mutating: true,
    run: (ctx, args) => deleteObjects(ctx, args),
  },
  {
    name: 'board_square',
    description:
      'Get the world position of a chess square (a1-h8) on a chessboard, so you can move pieces precisely: ' +
      'ask for the square, then transform_object a chess_piece there with mode absolute. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        board: { type: 'string', description: 'The chessboard object (id or name). Default: "chessboard".' },
        square: { type: 'string', description: 'Algebraic square, files a-h + ranks 1-8, e.g. "e4".' },
      },
      required: ['square'],
    },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => boardSquare(ctx, args),
  },
  {
    name: 'snapshot',
    description:
      'Save a restore point of the current scene (all objects, materials, lighting, camera). Call it before a risky ' +
      'sequence you want to be able to step back to, e.g. before a big redesign. undo steps back through these.',
    inputSchema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short label for the restore point, e.g. "before redesign".' },
      },
    },
    annotations: { idempotentHint: true },
    run: (ctx, args) => snapshotTool(ctx, args),
  },
  {
    name: 'undo',
    description:
      'Revert the scene to the state before the most recent change (each mutating tool auto-saves a restore point). ' +
      'Use whenever the user dislikes a change, or when your own edit turned out wrong. Can be repeated to step back.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { destructiveHint: true },
    run: (ctx, args) => undoTool(ctx, args),
  },
];

const MUTATING = new Set(TOOL_DEFS.filter((t) => t.mutating).map((t) => t.name));

export type ToolLogger = (tool: string, args: Record<string, unknown>, result: string) => void;

/** Shared invocation path: auto-snapshot, run, log. Used by WebMCP and dev harness alike. */
async function invoke(ctx: ToolContext, def: ToolDef, args: Record<string, unknown>, log: ToolLogger): Promise<string> {
  let result: string;
  try {
    if (MUTATING.has(def.name)) ctx.snapshots.capture(`before ${def.name}`);
    result = await def.run(ctx, args ?? {});
  } catch (e) {
    result = JSON.stringify({ ok: false, code: 'internal_error', error: `Tool "${def.name}" failed: ${e instanceof Error ? e.message : String(e)}` });
  }
  log(def.name, args ?? {}, result);
  return result;
}

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
          execute: async (input, execCtx) => {
            void execCtx;
            return invoke(ctx, def, input ?? {}, log);
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

/** Dispatch a tool directly (used by the local dev harness — gated to dev mode). */
export async function dispatchTool(
  ctx: ToolContext,
  name: string,
  args: Record<string, unknown>,
  log: ToolLogger,
): Promise<string> {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) {
    return JSON.stringify({ ok: false, code: 'unknown_tool', error: `Unknown tool "${name}". Available: ${TOOL_DEFS.map((t) => t.name).join(', ')}` });
  }
  return invoke(ctx, def, args ?? {}, log);
}
