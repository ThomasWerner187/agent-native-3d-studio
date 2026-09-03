import type { ToolContext } from './tools';
import * as THREE from 'three';
import {
  describeScene, queryScene, addObject, transformObject, setMaterial, setLighting,
  frameCamera, cameraPath, scatter, addGrove, addPath, undoScatter, snapshotTool, undoTool, setUi, fullSizeBounds,
  deleteObjects, boardSquare, chessMove, setMusicTool, helpTool,
  exportScene, importScene, fail, ok,
} from './tools';
import { OBJECT_TYPES } from './factory';
import { LIGHTING_PRESETS } from './scene';
import { cancelAllToolTweens } from './anim';

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
  /** Has its own position journal instead of a whole-scene snapshot. */
  journaled?: boolean;
  run: (ctx: ToolContext, args: Record<string, unknown>) => Promise<string> | string;
}

const TYPES = OBJECT_TYPES as unknown as string[];
const EXPECTED_VERSION = {
  expected_scene_version: {
    type: 'integer',
    minimum: 0,
    description: 'Optional optimistic-lock version from describe_scene/query_scene. Rejects the edit if the scene changed since that observation.',
  },
};

/**
 * CDP-only harnesses (Codex/ChatGPT driving Chrome without a WebMCP client)
 * read the getTools() listing before anything else — so every description
 * carries the exact in-page invocation pattern. This kills the #1 failure
 * mode we observed live: calling executeTool() with a tool NAME instead of
 * the registered tool object (fails, costs the agent a recovery turn).
 * Keep every description + this suffix within Chrome's 500-char budget.
 */
const CDP_RECIPE = (name: string) =>
  ' Recipe: mc=document.modelContext; mc.executeTool((await mc.getTools()).find(t=>t.name=="' + name + '"),JSON.stringify(args)).';

export const TOOL_DEFS: ToolDef[] = [
  {
    name: 'compose_lofi_scene',
    description: 'Compose one of three authored cozy worlds with one undo point. Optional cycle visits all three after each hold, with a dark dip between worlds. Returns immediately. Read describe_scene for progress and sequence; control_lofi pauses/resumes/stops/advances. Human takeover pauses the full sequence. Audio may need a click.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      scene: { type: 'string', enum: ['lakeside_cabin', 'lantern_grove', 'island_hideaway'], description: 'Authored starting world. Default lakeside_cabin.' },
      cycle: { type: 'boolean', description: 'Visit all three worlds repeatedly with one initial undo point. Default false.' },
      hold_seconds: { type: 'number', minimum: 120, maximum: 1800, description: 'Enjoy each completed world before cycling. Default 180 seconds.' },
      mood: { type: 'string', enum: ['moonlit', 'golden_hour'], description: 'Cool moonlight or warm sunset. Default moonlit.' },
      build_seconds: { type: 'number', minimum: 12, maximum: 90, description: 'Slow reveal duration. Default 32 seconds.' },
      seed: { type: 'integer', description: 'Repeatable forest arrangement. Default 42.' },
      camera: { type: 'string', enum: ['cinematic', 'orbit'], description: 'Infinite camera direction. Default cinematic.' },
      music: { type: 'boolean', description: 'Queue the local lofi playlist and fade in. Default true.' },
    } },
    mutating: true, annotations: { destructiveHint: true },
    run: (ctx, args) => JSON.stringify(ctx.lofi.start(args)),
  },
  {
    name: 'control_lofi',
    description: 'Control the full lofi sequence: pause freezes build, camera and scene changes; resume continues it. next intentionally replaces the world with the next authored scene. stop cancels future changes and keeps current objects. undo restores the scene before the initial composition, including across cycles.',
    inputSchema: { type: 'object', properties: { action: { type: 'string', enum: ['pause', 'resume', 'stop', 'next'] } }, required: ['action'] },
    annotations: { destructiveHint: true },
    run: (ctx, args) => {
      if (!['pause', 'resume', 'stop', 'next'].includes(String(args.action))) return fail('action must be pause, resume, stop or next.');
      if (args.action === 'resume' && !ctx.lofi.resume()) return fail('No paused lofi session to resume.');
      if (args.action === 'next' && !ctx.lofi.next()) return fail('Start a lofi session first, or wait for the current scene transition to finish.');
      if (args.action === 'pause') ctx.lofi.pause();
      if (args.action === 'stop') ctx.lofi.stop();
      return ok(ctx, { lofi: ctx.lofi.state });
    },
  },
  {
    name: 'set_camera_motion',
    description: 'Start or control endless camera motion. drift keeps an intimate front-facing garden view, gently sweeping instead of disappearing behind trees. targets frames live anchors together; distance/height override whole-world framing. Human input pauses it; resume explicitly. Returns immediately; inspect camera_motion.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      action: { type: 'string', enum: ['start', 'pause', 'resume', 'stop'] },
      mode: { type: 'string', enum: ['orbit', 'cinematic', 'drift'] },
      loop_seconds: { type: 'number', minimum: 60, maximum: 600, description: 'One seamless cycle. Default 240 seconds.' },
      target: { type: 'string', description: 'Scene or one object id/name. Default scene.' },
      targets: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 10, description: 'Frame these live objects together, e.g. cabin and pond. Overrides target.' },
      distance: { type: 'number', minimum: 8, maximum: 80, description: 'Horizontal orbit radius. 20–24 is an intimate cabin-and-pond view.' },
      height: { type: 'number', minimum: 2, maximum: 35, description: 'Height above the shared focus. 7–10 for a cozy garden view.' },
      azimuth_degrees: { type: 'number', minimum: -360, maximum: 360, description: 'World heading:0 looks from +Z. A cabin faces its rotation_y heading.' },
      sweep_degrees: { type: 'number', minimum: 10, maximum: 120, description: 'Total left/right sweep in drift mode. Default 50.' },
      blend_seconds: { type: 'number', minimum: 1, maximum: 15, description: 'Gentle entry flight duration. Default 8.' },
    }, required: ['action'] },
    run: (ctx, args) => {
      const action = args.action, mode = args.mode ?? 'cinematic', period = args.loop_seconds ?? 240;
      if (!['start', 'pause', 'resume', 'stop'].includes(String(action)) || !['orbit', 'cinematic', 'drift'].includes(String(mode)) || typeof period !== 'number' || !Number.isFinite(period) || period < 60 || period > 600) return fail('Valid action, mode and loop_seconds (60–600) are required.');
      for (const [key, min, max] of [['distance', 8, 80], ['height', 2, 35], ['azimuth_degrees', -360, 360], ['sweep_degrees', 10, 120], ['blend_seconds', 1, 15]] as const) {
        const value = args[key];
        if (value != null && (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max)) return fail(`${key} must be between ${min} and ${max}.`);
      }
      if (args.expected_scene_version != null && (!Number.isSafeInteger(args.expected_scene_version) || args.expected_scene_version !== ctx.store.version)) return fail('Scene changed since the camera plan. Read the live scene and retry.', 'stale_scene');
      const director = ctx.studio.director;
      if (action === 'start') {
        const targets = args.targets ?? [String(args.target ?? 'scene')];
        if (!Array.isArray(targets) || targets.length < 1 || targets.length > 10 || targets.some(target => typeof target !== 'string')) return fail('targets must contain 1–10 object ids or names.');
        const bounds = new THREE.Box3();
        for (const target of targets) {
          if (target === 'scene') for (const entry of ctx.store.all()) bounds.union(fullSizeBounds(entry.group));
          else {
            const resolved = ctx.store.resolve(target);
            if (!resolved.ok) return fail(resolved.error, 'unknown_target');
            bounds.union(fullSizeBounds(resolved.entry.group));
          }
        }
        const sphere = bounds.isEmpty() ? new THREE.Sphere(ctx.studio.controls.target.clone(), 5) : bounds.getBoundingSphere(new THREE.Sphere());
        // Focus on the lived-in garden rather than the treetop center of its bounds.
        if (mode === 'drift') sphere.center.y = Math.min(sphere.center.y, 1.6);
        ctx.lofi.preferMotion(mode === 'orbit' ? 'orbit' : 'cinematic');
        director.start(mode as 'orbit' | 'cinematic' | 'drift', period, sphere.center, sphere.radius,
          { distance: args.distance as number | undefined, height: args.height as number | undefined,
            azimuthDegrees: args.azimuth_degrees as number | undefined, sweepDegrees: args.sweep_degrees as number | undefined,
            blendSeconds: args.blend_seconds as number | undefined });
      }
      if (action === 'pause') director.pause();
      if (action === 'stop') director.stop();
      if (action === 'resume' && !director.resume()) return fail('No paused camera motion to resume.');
      return ok(ctx, { camera_motion: director.state });
    },
  },
  {
    name: 'arrange_scene',
    description: 'Adapt the existing diorama path, grove and lanterns to the live camp placement. Preserves the camp, selection and all human-edited objects. Searches around fixed obstacles before changing anything. Returns preserved_ids and moved_ids; undo_layout reverses only its positions.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      anchor: { type: 'string', description: 'Camp id/name. Defaults to selected camp, otherwise camp.' },
      seed: { type: 'integer', description: 'Deterministic grove variation. Default 42.' },
      clearance: { type: 'number', minimum: 0.3, maximum: 2, description: 'Extra clearance around camp and path. Default 0.6.' },
    } },
    annotations: { destructiveHint: false }, mutating: true, journaled: true,
    run: async (ctx, args) => JSON.stringify(await ctx.layout.arrange(args)),
  },
  {
    name: 'undo_layout',
    description: 'Undo the most recent arrangement, position by position. Keeps the camp, later human edits, material changes and newly created objects. Returns moved_ids and skipped_ids. Use this instead of whole-scene undo for cooperative layouts.',
    inputSchema: { type: 'object', properties: { ...EXPECTED_VERSION } },
    annotations: { destructiveHint: false }, mutating: true, journaled: true,
    run: async ctx => JSON.stringify(await ctx.layout.undo()),
  },
  {
    name: 'redo_layout',
    description: 'Reapply the last undone layout, preserving objects changed since the undo. Returns moved_ids and skipped_ids.',
    inputSchema: { type: 'object', properties: { ...EXPECTED_VERSION } },
    annotations: { destructiveHint: false }, mutating: true, journaled: true,
    run: async ctx => JSON.stringify(await ctx.layout.undo(true)),
  },
  {
    name: 'help',
    description:
      'START HERE. One call returns the studio playbook: workflow conventions, build/camera/chess recipes, ' +
      'and how to invoke tools correctly from any harness. Read-only.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => helpTool(ctx, args),
  },
  {
    name: 'describe_scene',
    description:
      'Read live scene state: selection, human edits, layout undo availability, object counts, positions, camera and lighting. Start here before arranging around a human placement. Large lists are truncated; query_scene paginates and returns bounds. Read-only.',
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
        ...EXPECTED_VERSION,
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
        name: { type: 'string', maxLength: 120, description: 'Short human-readable name (e.g. "reading lamp"). Helps later targeting.' },
        animate: { type: 'boolean', description: 'false = bulk placement: the object pops in staggered, but the call returns immediately instead of waiting for the pop (default true).' },
        delay_ms: { type: 'number', minimum: 0, maximum: 2000, description: 'animate:false only: delay the pop for authored reveals, in milliseconds.' },
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
        ...EXPECTED_VERSION,
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
        ...EXPECTED_VERSION,
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
        ...EXPECTED_VERSION,
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
        ...EXPECTED_VERSION,
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
      'Use to tour a build, reveal a scene, or orbit drama. Plays once; the result reports each completed shot. ' +
      'A user grabbing the camera interrupts gracefully (reported). Pair with set_ui {visible:false} for cinema.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_VERSION,
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
      'Add exactly count objects around any live anchor or within area. Preserves and avoids all existing objects, ' +
      'their real footprints, and other additions. Seeded planning either fits every object or changes nothing. ' +
      'Returns undo_id; undo_scatter keeps later human edits.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_VERSION,
        type: { type: 'string', enum: TYPES, description: 'What to scatter (usually tree, rock or lamp).' },
        count: { type: 'integer', minimum: 1, maximum: 200, description: 'Exact number to place; fails without changes if they cannot all fit.' },
        anchor: { type: 'string', description: 'Any existing object id/name. Without area, derives a spacious region around its live bounds.' },
        clearance: { type: 'number', minimum: 0, maximum: 5, description: 'Minimum gap between real footprints and preserved objects. Default 0.4.' },
        area: {
          type: 'object',
          description: 'Rectangle containing complete object footprints. Default: around anchor, or 10x10 at the origin.',
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
          description: 'Additional named obstacles (ids/names), validated before planning. All existing objects are always avoided.',
          items: { type: 'string' },
        },
        footprint: {
          type: 'string',
          enum: ['pad', 'actual_bounds'],
          description: 'Compatibility parameter. Both values now preserve full actual bounds; clearance sets the gap.',
        },
        seed: { type: 'integer', description: 'RNG seed for reproducible layouts. Omit to get a random one (returned in the result).' },
      },
      required: ['type', 'count'],
    },
    annotations: { destructiveHint: false },
    mutating: true,
    run: (ctx, args) => scatter(ctx, args),
  },
  {
    name: 'add_grove',
    description: 'Grow an exact forest around LIVE cabin/pond anchors: 80% behind the cabin, sparse sides, open porch; add warm lanterns. Plans every placement before mutation, preserves all existing objects. Canopies interleave naturally; trunks stay apart. Returns tree/light ids and targeted undo_id.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      cabin: { type: 'string', description: 'Live cabin id/name.' }, pond: { type: 'string', description: 'Live pond id/name for bank-side lanterns.' },
      count: { type: 'integer', minimum: 1, maximum: 100, description: 'Exact number of trees. Default 40.' },
      lights: { type: 'integer', minimum: 0, maximum: 12, description: 'Warm garden lanterns. Default 8.' },
      seed: { type: 'integer', description: 'Repeatable arrangement. Default 42.' },
      reveal_seconds: { type: 'number', minimum: 0, maximum: 15, description: 'Progressive tree/lantern reveal. Default 6.' },
    }, required: ['cabin'] },
    mutating: true, annotations: { destructiveHint: false }, run: addGrove,
  },
  {
    name: 'add_path',
    description: 'Add a curved stepping-stone path from the LIVE cabin porch to the LIVE pond bank. Every stone is independently editable. Plans against actual existing geometry before adding anything; tries both bends. Preserves human work. Returns ids, live endpoints and targeted undo_id.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      cabin: { type: 'string', description: 'Live cabin id/name.' }, pond: { type: 'string', description: 'Live pond id/name.' },
      count: { type: 'integer', minimum: 3, maximum: 40, description: 'Omit for stone spacing derived from the actual gap.' },
      bend: { type: 'number', minimum: -8, maximum: 8, description: 'Curve offset in meters. Default 2; opposite bends tried around obstacles.' },
      seed: { type: 'integer', description: 'Stone variation. Default 24.' },
      reveal_seconds: { type: 'number', minimum: 0, maximum: 15, description: 'Progressive reveal. Default 3.' },
    }, required: ['cabin', 'pond'] },
    mutating: true, annotations: { destructiveHint: false }, run: addPath,
  },
  {
    name: 'undo_scatter',
    description: 'Remove unchanged additions from one scatter. Preserves every existing object and additions edited or deleted afterward. Returns removed_ids and skipped_ids; never restores a whole scene.',
    inputSchema: { type: 'object', properties: {
      ...EXPECTED_VERSION,
      undo_id: { type: 'string', description: 'Id returned by scatter. Defaults to the most recent scatter.' },
    } },
    annotations: { destructiveHint: false }, mutating: true, journaled: true,
    run: (ctx, args) => undoScatter(ctx, args),
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
        ...EXPECTED_VERSION,
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
    name: 'export_scene',
    description:
      'Export objects, materials, camera and lighting as a compressed portable share URL. import_scene accepts it and older scene links. Copy or save the returned link before reloading; the active URL stays unchanged. Very large scenes or old uncompressed links may exceed browser-agent URL limits.',
    inputSchema: { type: 'object', properties: {} },
    annotations: { readOnlyHint: true },
    run: (ctx, args) => exportScene(ctx, args),
  },
  {
    name: 'import_scene',
    description:
      'Replace the scene with an exported one (from export_scene JSON or a share link). Captures an undo snapshot ' +
      'first, so you can modify the imported scene freely and undo returns to the previous state.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_VERSION,
        json: { type: 'string', description: 'Scene JSON from export_scene. Omit if you pass url.' },
        url: { type: 'string', description: 'A share link containing #scene=... .' },
      },
    },
    annotations: { destructiveHint: true },
    mutating: true,
    run: (ctx, args) => importScene(ctx, args),
  },
  {
    name: 'batch',
    description:
      'Run up to 200 scene edits/readouts in one turn: ops is an array of {tool,args}. One undo point. Stops on failure and rolls back; human takeover preserves partial work. Put expected_scene_version on the batch. Run UI, music, share links, background sessions and layout journals separately.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_VERSION,
        ops: {
          type: 'array',
          minItems: 1,
          maxItems: 200,
          description: 'The operations to run in order.',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: 'Tool name, e.g. "add_object".' },
              args: { type: 'object', description: 'That tool\'s arguments object.' },
            },
            required: ['tool'],
          },
        },
      },
      required: ['ops'],
    },
    annotations: { idempotentHint: false },
    mutating: true,
    run: (ctx, args) => batch(ctx, args),
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
    name: 'chess_move',
    description:
      'Move a chess piece to a square on a chessboard: the scene resolves the square to world coordinates, animates ' +
      'the move with a small lift, and can drive the camera. Chess rules stay with you — you decide the move, the ' +
      'scene performs it. piece accepts an id or a name; board defaults to the chessboard nearest the piece.',
    inputSchema: {
      type: 'object',
      properties: {
        ...EXPECTED_VERSION,
        piece: { type: 'string', description: 'The piece to move — id (e.g. "obj_17") or name (e.g. "white king e2").' },
        to: { type: 'string', description: 'Target square in algebraic notation, e.g. "e4" (files a-h, ranks 1-8).' },
        board: { type: 'string', description: 'Optional chessboard id/name. Omit to use the chessboard nearest the piece.' },
        camera: {
          type: 'string',
          enum: ['none', 'follow', 'hero'],
          description: 'Camera action after the move (default none). "follow" flies a low angle behind the piece; "hero" ends on a hero shot of the board.',
        },
      },
      required: ['piece', 'to'],
    },
    annotations: { idempotentHint: false },
    mutating: true,
    run: (ctx, args) => chessMove(ctx, args),
  },
  {
    name: 'set_music',
    description:
      'Put lofi music on or off: three self-made Suno tracks (Aurora Drift, Mirror Lake, Dusk Tide Drift) play as a ' +
      'playlist. Pure page ambience; does not change the 3D scene. The browser may hold audio until the first user ' +
      'gesture on the page (autoplay policy) — the result note tells you.',
    inputSchema: {
      type: 'object',
      properties: {
        on: { type: 'boolean', description: 'true = play, false = stop. Omit to toggle.' },
        volume: { type: 'number', minimum: 0, maximum: 1, description: 'Master volume 0-1 (default 0.5).' },
      },
    },
    annotations: { idempotentHint: true },
    run: (ctx, args) => setMusicTool(ctx, args),
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

// Append the in-page call recipe to every description (see CDP_RECIPE above).
for (const def of TOOL_DEFS) def.description += CDP_RECIPE(def.name);

/**
 * batch — N operations in ONE call: one snapshot, one result, one model turn.
 * Live measurement showed model turns (not scene animation) dominate agent
 * wall-clock, so collapsing turns is the single biggest speed lever.
 */
const BATCH_DISALLOWED = new Set(['compose_lofi_scene', 'control_lofi', 'set_camera_motion', 'batch', 'undo', 'snapshot', 'arrange_scene', 'undo_layout', 'redo_layout', 'undo_scatter', 'set_ui', 'set_music', 'export_scene']);

export async function batch(ctx: ToolContext, args: Record<string, unknown>): Promise<string> {
  const ops = Array.isArray(args.ops) ? args.ops : null;
  if (!ops) return fail('ops must be an array of {tool, args} objects.');
  if (ops.length < 1 || ops.length > 200) return fail('ops must contain 1-200 operations.');

  ctx.studio.noteActivity();
  // No extra snapshot here — batch is a mutating tool, so invoke() already
  // captured one for the whole batch. Two snapshots would make the first
  // undo a no-op.

  const results: Record<string, unknown>[] = [];
  const humanRevision = ctx.store.humanRevision;
  const humanChanges = { count: 0 };
  const batchContext = { ...ctx, humanChanges };
  const versionBefore = ctx.store.version;
  let failed = 0;
  let interrupted = false;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i] as { tool?: unknown; args?: unknown };
    const name = String(op?.tool ?? '');
    const def = TOOL_DEFS.find((d) => d.name === name);
    if (!def) {
      failed++;
      results.push({ index: i, ok: false, code: 'unknown_tool', error: `Unknown tool "${name}".` });
      break;
    }
    if (BATCH_DISALLOWED.has(name)) {
      failed++;
      results.push({ index: i, ok: false, code: 'bad_request', error: `"${name}" cannot run inside batch.` });
      break;
    }
    try {
      const input = (op?.args ?? {}) as Record<string, unknown>;
      const error = validateArguments(input, def.inputSchema, `ops[${i}].args`);
      const expected = input.expected_scene_version;
      const res = error ? fail(error, 'bad_request')
        : expected != null && expected !== ctx.store.version ? fail('Nested expected_scene_version is stale. Put the observed version on the batch itself.', 'stale_scene')
        : await def.run(batchContext, input);
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(res) as Record<string, unknown>;
      } catch {
        parsed = { ok: true, raw: res };
      }
      if (parsed.ok === false) failed++;
      results.push({ index: i, tool: name, ...parsed });
      interrupted = parsed.applied === false || ctx.store.humanRevision !== humanRevision + humanChanges.count;
      if (failed || interrupted) break;
    } catch (e) {
      failed++;
      results.push({ index: i, tool: name, ok: false, code: 'internal_error', error: e instanceof Error ? e.message : String(e) });
      break;
    }
  }

  // atomic: any failed operation rolls the whole batch back (one snapshot)
  // Human takeover must never be overwritten by a whole-scene rollback.
  interrupted ||= ctx.store.humanRevision !== humanRevision + humanChanges.count;
  const status = interrupted ? 'interrupted' : failed > 0 ? 'rolled_back' : 'applied';
  if (status === 'rolled_back') {
    const snapshot = transactionSnapshots.get(ctx.store);
    if (snapshot && ctx.store.version !== versionBefore) ctx.snapshots.restoreSnapshot(snapshot);
  }
  const payload: Record<string, unknown> = {
    operations: ops.length,
    failed,
    operations_attempted: results.length,
    transaction_status: status,
    results,
    note: interrupted
      ? 'The batch stopped when an operation was interrupted or a human edited the scene. Live partial changes and human work are preserved; inspect the scene before continuing.'
      : status === 'rolled_back'
      ? `${failed} of ${ops.length} operations failed — the batch was rolled back atomically; the scene is unchanged.`
      : `All ${ops.length} operations applied. undo rolls the whole batch back.`,
  };
  if (failed > 0 || interrupted) {
    return JSON.stringify({ ok: false, applied: false, code: interrupted ? 'batch_interrupted' : 'batch_rolled_back', error: payload.note, ...payload });
  }
  return ok(ctx, payload);
}

const MUTATING = new Set(TOOL_DEFS.filter((t) => t.mutating).map((t) => t.name));
const activeTransactions = new WeakMap<ToolContext['store'], string>();
const transactionSnapshots = new WeakMap<ToolContext['store'], string>();

/** Enforce the same small schema vocabulary advertised to native hosts.
 * The development harness and nested batch calls must obey it as well. */
function validateArguments(value: unknown, schema: Record<string, unknown>, path = 'args'): string | null {
  const types = Array.isArray(schema.type) ? schema.type : [schema.type];
  const isRecord = value !== null && typeof value === 'object' && !Array.isArray(value);
  const matches = (type: unknown) => type === undefined
    || (type === 'object' && isRecord)
    || (type === 'array' && Array.isArray(value))
    || (type === 'number' && typeof value === 'number' && Number.isFinite(value))
    || (type === 'integer' && typeof value === 'number' && Number.isSafeInteger(value))
    || (type === 'string' && typeof value === 'string')
    || (type === 'boolean' && typeof value === 'boolean');
  if (!types.some(matches)) return `${path} must be ${types.join(' or ')}.`;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return `${path} must be one of: ${schema.enum.join(', ')}.`;
  if (typeof value === 'number') {
    if (typeof schema.minimum === 'number' && value < schema.minimum) return `${path} must be at least ${schema.minimum}.`;
    if (typeof schema.maximum === 'number' && value > schema.maximum) return `${path} must be at most ${schema.maximum}.`;
  }
  if (typeof value === 'string' && typeof schema.maxLength === 'number' && value.length > schema.maxLength) return `${path} must be at most ${schema.maxLength} characters.`;
  if (Array.isArray(value)) {
    if (typeof schema.minItems === 'number' && value.length < schema.minItems) return `${path} needs at least ${schema.minItems} items.`;
    if (value.length > (typeof schema.maxItems === 'number' ? schema.maxItems : 600)) return `${path} contains too many items.`;
    if (schema.items) for (let i = 0; i < value.length; i++) {
      const error = validateArguments(value[i], schema.items as Record<string, unknown>, `${path}[${i}]`);
      if (error) return error;
    }
  }
  if (isRecord) {
    const record = value as Record<string, unknown>;
    for (const key of (schema.required ?? []) as string[]) if (record[key] === undefined) return `${path}.${key} is required.`;
    for (const [key, child] of Object.entries((schema.properties ?? {}) as Record<string, Record<string, unknown>>)) {
      if (record[key] === undefined) continue;
      const error = validateArguments(record[key], child, `${path}.${key}`);
      if (error) return error;
    }
  }
  return null;
}

export type ToolLogger = (tool: string, args: Record<string, unknown>, result: string) => void;

function invocationId(): string {
  return `op_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Shared invocation path: auto-snapshot, run, log. Used by WebMCP and dev harness alike. */
async function invoke(ctx: ToolContext, def: ToolDef, args: Record<string, unknown>, log: ToolLogger, signal?: AbortSignal, actor: 'agent' | 'human' | 'demo' = 'agent'): Promise<string> {
  ctx.studio.noteActivity();
  ctx.store.syncMatrices();
  const t0 = performance.now();
  const fallbackOperationId = invocationId();
  const versionBefore = ctx.store.version;
  const isMutating = MUTATING.has(def.name);
  const nextLofiScene = def.name === 'control_lofi' && args?.action === 'next';
  const transaction = isMutating || def.name === 'undo' || def.name === 'snapshot' || nextLofiScene;
  const argumentError = validateArguments(args, def.inputSchema);
  const active = transaction && activeTransactions.get(ctx.store);
  if (argumentError || active) {
    const result = JSON.stringify({ ok: false, code: argumentError ? 'bad_request' : 'scene_busy',
      operation_id: fallbackOperationId, actor, applied: false, scene_version_before: versionBefore,
      scene_version_after: versionBefore, duration_ms: 0,
      error: argumentError ?? `The ${active} operation is still settling. Re-observe the scene and retry when it completes.` });
    log(def.name, args, result); return result;
  }
  if (ctx.layout.busy && (isMutating || def.name === 'undo' || nextLofiScene)) {
    const result = JSON.stringify({ ok: false, operation_id: fallbackOperationId, scene_version_before: versionBefore, scene_version_after: ctx.store.version, duration_ms: 0, code: 'layout_busy', actor, applied: false, error: 'A layout is still running. Read the scene after it settles and retry.' });
    log(def.name, args, result);
    return result;
  }

  if (ctx.lofi.building && isMutating && def.name !== 'compose_lofi_scene') {
    const result = JSON.stringify({ ok: false, code: 'lofi_busy', operation_id: fallbackOperationId, actor, applied: false,
      scene_version_before: versionBefore, scene_version_after: versionBefore, duration_ms: 0,
      error: 'Lofi construction is active. Read describe_scene, or control_lofi stop before editing. undo restores the original scene.' });
    log(def.name, args, result); return result;
  }

  // optimistic concurrency: reject stale plans before touching the scene
  const expected = args?.expected_scene_version;
  if (isMutating && expected != null) {
    const exp = expected;
    const failure = (code: string, error: string, extra: Record<string, unknown> = {}) => JSON.stringify({
      ok: false,
      code,
      operation_id: fallbackOperationId,
      actor,
      scene_version_before: versionBefore,
      scene_version_after: ctx.store.version,
      applied: false,
      duration_ms: Math.round(performance.now() - t0),
      error,
      ...extra,
    });
    if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp < 0) {
      const result = failure('bad_request', 'expected_scene_version must be a non-negative integer.');
      log(def.name, args ?? {}, result);
      return result;
    }
    if (exp !== ctx.store.version) {
      const result = failure(
        'stale_scene',
        `Stale observation: you saw scene_version ${exp}, but the scene is now ${ctx.store.version} (the human or another operation changed it). Re-observe with describe_scene/query_scene and retry.`,
        { expected_scene_version: exp, actual_scene_version: ctx.store.version },
      );
      log(def.name, args ?? {}, result);
      return result;
    }
  }

  // exactly one snapshot per logical transaction, taken here (central ownership)
  const snapId = isMutating && !def.journaled ? ctx.snapshots.capture(`before ${def.name}`) : null;

  if (signal?.aborted) {
    if (snapId) ctx.snapshots.discard(snapId);
    const result = JSON.stringify({
      ok: false,
      code: 'cancelled',
      operation_id: fallbackOperationId,
      actor,
      scene_version_before: versionBefore,
      scene_version_after: ctx.store.version,
      applied: false,
      duration_ms: Math.round(performance.now() - t0),
      error: 'Cancelled before it started.',
    });
    log(def.name, args ?? {}, result);
    return result;
  }
  const onAbort = () => { if (transaction) cancelAllToolTweens(); };
  signal?.addEventListener('abort', onAbort, { once: true });

  let result: string;
  if (transaction) activeTransactions.set(ctx.store, def.name);
  if (snapId) transactionSnapshots.set(ctx.store, snapId);
  try {
    result = await def.run({ ...ctx, actor, ...(signal ? { signal } : {}) }, args ?? {});
  } catch (e) {
    result = JSON.stringify({ ok: false, code: 'internal_error', error: `Tool "${def.name}" failed: ${e instanceof Error ? e.message : String(e)}` });
  } finally {
    signal?.removeEventListener('abort', onAbort);
    ctx.store.syncMatrices();
    if (transaction) activeTransactions.delete(ctx.store);
    if (snapId) transactionSnapshots.delete(ctx.store);
  }

  // uniform operation envelope: every invocation reports the same metadata
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(result) as Record<string, unknown>;
  } catch {
    data = { ok: true, raw: result };
  }
  const ok = data.ok !== false;
  if (signal?.aborted && ok) {
    // the run finished, but cancellation arrived mid-flight: report honestly
    data = { ...data, applied: false, cancelled: true };
  }
  // A failed call with partial effects must remain reversible. Pure validation
  // failures and an explicitly rolled-back batch leave no undo noise.
  if (!ok && snapId && (ctx.store.version === versionBefore || data.transaction_status === 'rolled_back')) ctx.snapshots.discard(snapId);

  const envelope: Record<string, unknown> = {
    ok,
    operation_id: typeof data.operation_id === 'string' ? data.operation_id : fallbackOperationId,
    actor,
    scene_version_before: versionBefore,
    scene_version_after: ctx.store.version,
    applied: (data.applied as boolean) ?? ok,
    duration_ms: Math.round(performance.now() - t0),
  };
  delete data.operation_id;
  delete data.applied;
  if (ok) {
    envelope.result = data;
  } else {
    envelope.code = data.code ?? 'internal_error';
    envelope.error = data.error ?? 'operation failed';
    envelope.result = data;
  }
  result = JSON.stringify(envelope);
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
            return invoke(ctx, def, input ?? {}, log, execCtx?.signal);
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
  actor: 'agent' | 'human' | 'demo' = 'demo',
): Promise<string> {
  const def = TOOL_DEFS.find((t) => t.name === name);
  if (!def) {
    return JSON.stringify({ ok: false, code: 'unknown_tool', error: `Unknown tool "${name}". Available: ${TOOL_DEFS.map((t) => t.name).join(', ')}` });
  }
  return invoke(ctx, def, args ?? {}, log, undefined, actor);
}
