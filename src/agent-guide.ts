/**
 * The agent playbook — one document, three surfaces:
 * 1. the `help` WebMCP tool (for agents with tool injection),
 * 2. <script type="application/json" id="agent-manifest"> in the DOM
 *    (for DOM-scraping agents),
 * 3. the console banner (for CDP/console-driven agents).
 * Keep the playbook under ~1300 chars so it fits one tool-result budget.
 */

export const AGENT_PLAYBOOK = [
  'CO-CREATE: describe_scene includes selected_id, human_edits and layout history. After a human drags the camp, arrange_scene{anchor:"camp",expected_scene_version} adapts the tagged grove/path/lanterns to its LIVE placement, preserving human edits. undo_layout and redo_layout restore ONLY layout positions, skipping later edits. Use these for collaboration; generic undo restores the entire scene. Try layout / Guided tour are local handlers, not AI sessions.',
  'WORKFLOW: start with describe_scene — objects have ids ("obj_3") and names; both target tools. Mutating tools animate and reply only AFTER the scene settled, with live values + scene_version. undo steps back, so experiment freely.',
  'BUILD: add_object{type,position{x,z},scale,name} — types: box/sphere/cylinder/plane/tree/rock/lamp/window/chair/table/chessboard/chess_piece. scatter{type,count,area{cx,cz,w,d},seed} places many with natural variation. set_material{targets,color"#hex",emissive} makes things glow; set_lighting{preset:golden_hour|night_neon|studio|overcast|moonlit,intensity}.',
  'CAMERA: frame_camera{target:"scene"|id,angle:front|side|top|three_quarter|low|hero,select:false}. camera_path{keyframes:[{target,angle,hold_ms}]} flies sequences — fly-throughs, reveals. Hide the HUD with set_ui{visible:false} for clean shots.',
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
