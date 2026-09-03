/**
 * The agent playbook — one document, three surfaces:
 * 1. the `help` WebMCP tool (for agents with tool injection),
 * 2. <script type="application/json" id="agent-manifest"> in the DOM
 *    (for DOM-scraping agents),
 * 3. the console banner (for CDP/console-driven agents).
 * Keep this focused on the shared workflow and current tool contracts.
 */

export const AGENT_PLAYBOOK = [
  'CO-CREATE: the human can Start empty, Add pond/Add cabin, drag objects or change position/rotation/size in the inspector. Continue THAT live world. Start with describe_scene, then query_scene{include_bounds:true}; inspect selected_id, human_edits, recent_changes, created_by, last_changed_by, revision and human_revision. Re-read after each human edit; use current expected_scene_version. Never replace the world with a preset unless asked.',

  'GROW: scatter{type:"tree",count:30,anchor:"live cabin id",clearance:0.6,seed:42} derives its area from the anchor LIVE bounds and adds around existing geometry. Other groups can add rocks and lamps. Every scatter preserves existing objects and returns its exact added count, ids, preserved_ids and undo_id. If insufficient space, nothing is added: expand area and retry. undo_scatter{undo_id} removes only untouched additions, preserving later human edits; describe_scene exposes scatter_history. Verify counts and anchors afterward.',

  'LOFI: compose_lofi_scene{scene:"lakeside_cabin"|"lantern_grove"|"island_hideaway",mood:"moonlit"|"golden_hour",build_seconds:32,seed:42,camera:"cinematic"|"orbit",music:true,cycle:true,hold_seconds:180} progressively builds an authored world, fades in music and loops the camera. Cycling visits all three worlds, using one undo point. Returns immediately with session_id; describe_scene reports actual progress, sequence countdown, camera and audio. control_lofi{action:"pause"|"resume"|"stop"|"next"}. Human input pauses the entire sequence; explicitly resume. Music may need a user gesture. The local Create button invokes the same handler, not an AI model. Recording is not implemented.',

  'CAMP LAYOUT: arrange_scene{anchor:"camp",expected_scene_version} adapts an existing tagged grove/path/lanterns to the camp LIVE placement, preserving human edits. undo_layout and redo_layout restore ONLY layout positions, skipping later edits. Generic undo restores the entire scene; use targeted undo_scatter or undo_layout for shared work. Try layout / Guided tour are local handlers, not AI sessions.',
  'WORKFLOW: start with describe_scene — objects have ids ("obj_3") and names; both target tools. Finite mutations reply after settling; lofi and continuous camera return immediately with observable state, with live values + scene_version. undo steps back, so experiment freely.',
  'BUILD: add_object{type,position:{x,z},scale,name} — types: box/sphere/cylinder/plane/tree/rock/lamp/window/chair/table/chessboard/chess_piece/camp/cabin/pond. scatter also accepts area:{center_x,center_z,width,depth}. set_material{targets,color:"#hex",emissive} makes things glow; set_lighting{preset:golden_hour|night_neon|studio|overcast|moonlit,intensity}.',
  'ATMOSPHERE: after the human edits one object, inspect the scene again. Keep all geometry/materials intact; set_lighting{preset:"golden_hour",intensity:0.9} adds warmth. set_camera_motion{action:"start",mode:"cinematic",target:"scene",loop_seconds:240} starts an endless gentle camera on the CURRENT world. It returns immediately; verify camera_motion with describe_scene. Human input pauses it; resume explicitly. No preset composition is needed.',
  'CAMERA: frame_camera{target:"scene"|id,angle:front|side|top|three_quarter|low|hero,select:false}. camera_path{keyframes:[{target,angle,hold_ms}]} flies finite sequences. Hide the HUD with set_ui{visible:false} only when the human wants clean shots.',
  'CHESS: add_object{type:"chessboard"} → board_square{square:"e4"} shows positions → add chess pieces (piece:"queen",side:"black") → chess_move{piece:"white pawn e2",to:"e4",camera:"follow"} performs the move and flies the camera. delete_objects{name_contains:"pawn"} clears groups. You supply the rules; the scene supplies geometry.',
  'HUMANS: the mouse always works, even mid-call. A human grabbing the camera interrupts agent camera moves — the result then says applied:false.',
].join('\n');

/**
 * For agent harnesses that cannot inject WebMCP tools (e.g. CDP-only browser
 * control): the tools are still reachable through the standard in-page API.
 * This snippet is the canonical way to discover and call them.
 */
export const NO_CLIENT_RECIPE = [
  '// No WebMCP tool surface in your harness? Call the page tools via the standard in-page API:',
  'const mc = document.modelContext;',
  'const tools = await mc.getTools();                    // discover the current tools',
  'const add = tools.find(t => t.name === "add_object");',
  'await mc.executeTool(add, JSON.stringify({ type: "tree", position: { x: 2, z: 1 } }));',
  '// every result is a JSON string {ok, scene_version, ...}; read back with describe_scene.',
].join('\n');
