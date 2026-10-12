"""Build a futuristic, layered Blender interface for the DRI BA400 graph."""

from __future__ import annotations

import math
import re
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend/src/modules/dri/knowledge/ba400SubsystemHierarchy.ts"
OUTPUT = ROOT / "DRI_BA400_Interfaz_Futurista.blend"
PREVIEW = ROOT / "DRI_BA400_Interfaz_Futurista_preview.png"
GRAPH_PREVIEW = ROOT / "DRI_BA400_Interfaz_Futurista_grafo.png"

# Exact system colors currently used by the DRI hierarchy.
SYSTEMS = [
    ("chemistry", "Programa analítico", "#7bd6df"),
    ("optics", "Sistema óptico", "#e8bc65"),
    ("reaction", "Rotor de reacción", "#b9cad9"),
    ("sample", "Rotor de muestras", "#a9dcd2"),
    ("reagent", "Rotor de reactivos", "#9fd7cf"),
    ("fluidics", "Sistema fluídico", "#aac9d0"),
    ("pipetting", "Brazos de pipeteo", "#9eb9d9"),
    ("wash", "Estación de lavado", "#b4d5cb"),
]


def safe(value: str) -> str:
    return re.sub(r"[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", "_", value).strip("_")[:56]


def rgba(value: str, alpha=1.0):
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (alpha,)


def parse_nodes():
    source = SOURCE.read_text(encoding="utf-8")
    block = source.split("const BA400_HIERARCHY:", 1)[1].split("];", 1)[0]
    pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*parentId:\s*(null|'[^']+'),\s*"
        r"rootId:\s*'([^']+)',\s*label:\s*'([^']+)',\s*"
        r"subtitle:\s*'([^']+)',\s*depth:\s*(\d)"
    )
    nodes = []
    for match in pattern.finditer(block):
        node_id, parent, root, label, subtitle, depth = match.groups()
        nodes.append(
            dict(
                id=node_id,
                parent=None if parent == "null" else parent.strip("'"),
                root=root,
                label=label,
                subtitle=subtitle,
                depth=int(depth),
            )
        )
    if len(nodes) != 88:
        raise RuntimeError(f"Jerarquía DRI incompleta: {len(nodes)}/88")
    return nodes


def clear():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)
    for group in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(group):
            group.remove(block)


def collection(name, parent=None):
    result = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(result)
    return result


def relink(obj, target):
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    target.objects.link(obj)


def emission_material(name, color, strength=2.0, metallic=0.0, roughness=0.28):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Emission Color"].default_value = color
    bsdf.inputs["Emission Strength"].default_value = strength
    return mat


def hologram_material(name, color, opacity=0.08, emission_strength=0.45):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color[:3] + (opacity,)
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    nodes.clear()
    output = nodes.new("ShaderNodeOutputMaterial")
    transparent = nodes.new("ShaderNodeBsdfTransparent")
    transparent.inputs["Color"].default_value = (0, 0, 0, 1)
    emission = nodes.new("ShaderNodeEmission")
    emission.inputs["Color"].default_value = color
    emission.inputs["Strength"].default_value = emission_strength
    mix = nodes.new("ShaderNodeMixShader")
    mix.inputs[0].default_value = opacity
    links.new(transparent.outputs[0], mix.inputs[1])
    links.new(emission.outputs[0], mix.inputs[2])
    links.new(mix.outputs[0], output.inputs[0])
    if hasattr(mat, "surface_render_method"):
        mat.surface_render_method = "DITHERED"
    return mat


def dark_material(name, color=(0.006, 0.016, 0.035, 1), metallic=0.7, roughness=0.2):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    return mat


def spherical(radius, azimuth, latitude):
    return Vector(
        (
            radius * math.cos(latitude) * math.cos(azimuth),
            radius * math.cos(latitude) * math.sin(azimuth),
            radius * math.sin(latitude),
        )
    )


def curve_object(name, points, mat, target_collection, width=0.012, cyclic=False):
    data = bpy.data.curves.new(name, "CURVE")
    data.dimensions = "3D"
    data.resolution_u = 2
    data.bevel_depth = width
    data.bevel_resolution = 2
    spline = data.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    spline.use_cyclic_u = cyclic
    obj = bpy.data.objects.new(name, data)
    target_collection.objects.link(obj)
    data.materials.append(mat)
    return obj


def sector_panel(name, az0, az1, mat, target_collection, radius=5.0):
    az_steps, lat_steps = 10, 18
    lat0, lat1 = math.radians(-70), math.radians(70)
    vertices = []
    for lat_index in range(lat_steps + 1):
        latitude = lat0 + (lat1 - lat0) * lat_index / lat_steps
        for az_index in range(az_steps + 1):
            azimuth = az0 + (az1 - az0) * az_index / az_steps
            vertices.append(tuple(spherical(radius, azimuth, latitude)))
    stride = az_steps + 1
    faces = []
    for lat_index in range(lat_steps):
        for az_index in range(az_steps):
            a = lat_index * stride + az_index
            faces.append((a, a + 1, a + stride + 1, a + stride))
    mesh = bpy.data.meshes.new(f"MESH__{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    target_collection.objects.link(obj)
    mesh.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    return obj


def orb(name, location, radius, mat, target_collection, subdivisions=2):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=subdivisions, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    relink(obj, target_collection)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Halo_suave", "BEVEL")
    bevel.width = radius * 0.08
    bevel.segments = 2
    return obj


def ring(name, radius, z, mat, target_collection, minor=0.012, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_torus_add(
        major_radius=radius,
        minor_radius=minor,
        major_segments=96,
        minor_segments=8,
        location=(0, 0, z),
        rotation=rotation,
    )
    obj = bpy.context.object
    obj.name = name
    relink(obj, target_collection)
    obj.data.materials.append(mat)
    return obj


def add_props(obj, node):
    obj["dri_id"] = node["id"]
    obj["dri_label"] = node["label"]
    obj["dri_subtitle"] = node["subtitle"]
    obj["dri_depth"] = node["depth"]
    obj["dri_parent_id"] = node["parent"] or ""
    obj["dri_root_id"] = node["root"]
    obj["source"] = str(SOURCE.relative_to(ROOT))


def make_text(name, body, location, size, mat, target_collection, camera, align="CENTER"):
    data = bpy.data.curves.new(name, "FONT")
    data.body = body
    data.align_x = align
    data.align_y = "CENTER"
    data.size = size
    data.extrude = 0.004
    data.bevel_depth = 0.001
    data.materials.append(mat)
    obj = bpy.data.objects.new(name, data)
    target_collection.objects.link(obj)
    obj.location = location
    constraint = obj.constraints.new("TRACK_TO")
    constraint.target = camera
    constraint.track_axis = "TRACK_Z"
    constraint.up_axis = "UP_Y"
    return obj


def look_at(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def normalized_tree_positions(nodes, root_id):
    children = defaultdict(list)
    for node in nodes:
        if node["parent"]:
            children[node["parent"]].append(node["id"])
    cursor = 0
    positions = {}

    def visit(node_id):
        nonlocal cursor
        if not children[node_id]:
            value = cursor
            cursor += 1
        else:
            values = [visit(child) for child in children[node_id]]
            value = sum(values) / len(values)
        positions[node_id] = float(value)
        return value

    visit(root_id)
    maximum = max(positions.values(), default=1)
    return {node_id: (value / maximum if maximum else 0.5) for node_id, value in positions.items()}


def find_layer(layer_collection, name):
    if layer_collection.name == name:
        return layer_collection
    for child in layer_collection.children:
        result = find_layer(child, name)
        if result:
            return result
    return None


def exclude(view_layer, name):
    layer = find_layer(view_layer.layer_collection, name)
    if layer:
        layer.exclude = True


def setup_compositor(scene):
    scene.use_nodes = True
    node_group = bpy.data.node_groups.new("DRI_Compositor", "CompositorNodeTree")
    scene.compositing_node_group = node_group
    nodes = node_group.nodes
    links = node_group.links
    nodes.clear()
    render_layers = nodes.new("CompositorNodeRLayers")
    glare = nodes.new("CompositorNodeGlare")
    glare.inputs["Type"].default_value = "Fog Glow"
    glare.inputs["Quality"].default_value = "High"
    glare.inputs["Threshold"].default_value = 0.85
    glare.inputs["Strength"].default_value = 0.38
    glare.inputs["Size"].default_value = 0.58
    node_group.interface.new_socket(name="Image", in_out="OUTPUT", socket_type="NodeSocketColor")
    composite = nodes.new("NodeGroupOutput")
    links.new(render_layers.outputs["Image"], glare.inputs["Image"])
    links.new(glare.outputs["Image"], composite.inputs["Image"])


def main():
    nodes = parse_nodes()
    clear()
    scene = bpy.context.scene
    scene.name = "DRI_BA400_Interfaz_Futurista"
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1440
    scene.render.resolution_y = 960
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.film_transparent = False
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.001, 0.005, 0.014)
    scene.world.use_nodes = True
    scene.world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.001, 0.006, 0.018, 1)
    scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.12
    setup_compositor(scene)

    hud = collection("00_HUD_FUTURISTA")
    core_collection = collection("01_NUCLEO_Y_CAPAS")
    systems_collection = collection("02_SISTEMAS_DRI")
    dynamic_collection = collection("03_CAPAS_DINAMICAS_DEL_CASO")
    technical_collection = collection("99_CAMARAS_Y_LUCES")

    cyan = emission_material("MAT__HUD_CYAN", (0.03, 0.78, 0.92, 1), 2.0, metallic=0.1, roughness=0.2)
    cyan_soft = hologram_material("MAT__HUD_TRANSLUCIDO", (0.03, 0.72, 0.88, 1), 0.12, 0.7)
    white = emission_material("MAT__TEXTO", (0.70, 0.95, 1.0, 1), 1.5, roughness=0.25)
    dark = dark_material("MAT__BASE_OSCURA")

    camera_data = bpy.data.cameras.new("CAM__DRI_Holografica")
    camera = bpy.data.objects.new("CAM__DRI_Holografica", camera_data)
    technical_collection.objects.link(camera)
    camera.location = Vector((18.5, -23.0, 12.0))
    camera_data.lens = 60
    look_at(camera, (0, 0, 0.15))
    scene.camera = camera

    # Holographic stage and interface rings.
    bpy.ops.mesh.primitive_cylinder_add(vertices=96, radius=5.35, depth=0.16, location=(0, 0, -5.23))
    stage = bpy.context.object
    stage.name = "HUD__PLATAFORMA"
    relink(stage, hud)
    stage.data.materials.append(dark)
    ring("HUD__ANILLO_BASE_01", 5.22, -5.12, cyan, hud, 0.018)
    ring("HUD__ANILLO_BASE_02", 4.70, -5.10, cyan, hud, 0.008)
    ring("HUD__ORBITA_A", 5.65, 0, cyan, hud, 0.009, (math.radians(72), 0, math.radians(18)))
    ring("HUD__ORBITA_B", 5.82, 0, cyan, hud, 0.006, (math.radians(84), math.radians(12), math.radians(-22)))

    make_text("HUD__TITULO", "DRI // BA400", Vector((0, 0, 6.20)), 0.34, white, hud, camera)
    make_text(
        "HUD__SUBTITULO",
        "DIAGNÓSTICO  ·  RELACIONES  ·  INTELIGENCIA",
        Vector((0, 0, 5.78)),
        0.105,
        cyan,
        hud,
        camera,
    )

    # Concentric hierarchy shells: L4 core -> L1 system surface.
    shell_radii = {1: 5.0, 2: 4.18, 3: 3.26, 4: 2.34}
    for depth, radius in shell_radii.items():
        bpy.ops.mesh.primitive_uv_sphere_add(segments=48, ring_count=16, radius=radius)
        shell = bpy.context.object
        shell.name = f"CAPA_L{depth}__R_{radius:.2f}"
        relink(shell, core_collection)
        shell.data.materials.append(cyan_soft)
        wire = shell.modifiers.new("Reticula_holografica", "WIREFRAME")
        wire.thickness = 0.0035 if depth > 1 else 0.005
        wire.use_replace = True

    core = orb("NUCLEO__DRI", Vector((0, 0, 0)), 0.86, cyan, core_collection, subdivisions=3)
    core["descripcion"] = "Núcleo holográfico del modelo DRI."
    make_text("NUCLEO__TEXTO", "DRI", Vector((0, -0.92, 0)), 0.22, white, core_collection, camera)

    width = math.tau / len(SYSTEMS)
    gap = math.radians(4.0)
    base_azimuth = math.radians(-45)
    root_latitudes = [20, -18, 34, -32, 8, -8, 40, -40]
    node_sizes = {1: 0.225, 2: 0.145, 3: 0.105, 4: 0.080}
    system_collections = []
    surface_collections = []
    detail_collections = []
    connections_collections = []
    label_l2_collections = []
    label_deep_collections = []
    visual_nodes = {}
    positions = {}

    for system_index, (root_key, fallback_label, color_hex) in enumerate(SYSTEMS):
        number = system_index + 1
        prefix = f"{number:02d}_{root_key.upper()}"
        root_nodes = [node for node in nodes if node["root"] == root_key]
        root_node = next(node for node in root_nodes if node["depth"] == 1)
        system_collection = collection(f"{prefix}__{safe(root_node['label'])}", systems_collection)
        system_collections.append(system_collection.name)
        sector_collection = collection(f"{prefix}__00_SECTOR_HOLOGRAFICO", system_collection)
        surface_collection = collection(f"{prefix}__00A_SUPERFICIE_TRANSLUCIDA", sector_collection)
        surface_collections.append(surface_collection.name)
        grid_collection = collection(f"{prefix}__00B_RETICULA_Y_BORDES", sector_collection)
        root_collection = collection(f"{prefix}__01_RAIZ_SISTEMA", system_collection)
        detail_collection = collection(f"{prefix}__02_NODOS_DETALLE", system_collection)
        detail_collections.append(detail_collection.name)
        level_collections = {
            2: collection(f"{prefix}__L2_SUBSISTEMAS", detail_collection),
            3: collection(f"{prefix}__L3_COMPONENTES", detail_collection),
            4: collection(f"{prefix}__L4_MICROCOMPONENTES", detail_collection),
        }
        connection_collection = collection(f"{prefix}__03_CONEXIONES", system_collection)
        connections_collections.append(connection_collection.name)
        label_root_collection = collection(f"{prefix}__04_ETIQUETA_RAIZ", system_collection)
        label_l2_collection = collection(f"{prefix}__05_ETIQUETAS_L2", system_collection)
        label_l2_collections.append(label_l2_collection.name)
        label_deep_collection = collection(f"{prefix}__06_ETIQUETAS_L3_L4", system_collection)
        label_deep_collections.append(label_deep_collection.name)

        color = rgba(color_hex)
        node_mat = emission_material(f"MAT__{prefix}__NODOS", color, 1.8, metallic=0.08, roughness=0.22)
        line_mat = emission_material(f"MAT__{prefix}__LINEAS", color, 1.15, roughness=0.3)
        panel_mat = hologram_material(f"MAT__{prefix}__SECTOR", color, 0.045, 0.65)

        center_az = base_azimuth + system_index * width
        az0 = center_az - width / 2 + gap / 2
        az1 = center_az + width / 2 - gap / 2
        panel = sector_panel(f"SECTOR__{root_node['label']}", az0, az1, panel_mat, surface_collection)
        panel["dri_root_id"] = root_key
        panel["dri_label"] = root_node["label"]

        # Neon sector boundaries and three latitude guides.
        for boundary_index, azimuth in enumerate((az0, az1), start=1):
            points = [spherical(5.03, azimuth, math.radians(-70 + 140 * step / 32)) for step in range(33)]
            curve_object(f"BORDE__{prefix}__{boundary_index}", points, line_mat, grid_collection, 0.010)
        for latitude_deg in (-42, 0, 42):
            latitude = math.radians(latitude_deg)
            points = [spherical(5.025, az0 + (az1 - az0) * step / 20, latitude) for step in range(21)]
            curve_object(f"RETICULA__{prefix}__LAT_{latitude_deg:+03d}", points, line_mat, grid_collection, 0.004)

        root_lat = math.radians(root_latitudes[system_index])
        root_position = spherical(shell_radii[1] + 0.12, center_az, root_lat)
        root_obj = orb(f"L1__{root_node['label']}", root_position, node_sizes[1], node_mat, root_collection, subdivisions=3)
        add_props(root_obj, root_node)
        visual_nodes[root_node["id"]] = root_obj
        positions[root_node["id"]] = root_position

        label_position = spherical(5.72, center_az, root_lat)
        root_label = make_text(
            f"TXT_L1__{root_node['label']}",
            f"{number:02d} // {root_node['label'].upper()}",
            label_position,
            0.145,
            node_mat,
            label_root_collection,
            camera,
        )
        root_label["dri_id"] = root_node["id"]

        tree_positions = normalized_tree_positions(root_nodes, root_node["id"])
        for node in root_nodes:
            if node["depth"] == 1:
                continue
            depth = node["depth"]
            normalized = tree_positions[node["id"]]
            latitude = math.radians(-58 + normalized * 116)
            depth_az_offset = {2: -0.22, 3: 0.0, 4: 0.22}[depth] * (width / 2 - gap)
            azimuth = center_az + depth_az_offset
            position = spherical(shell_radii[depth], azimuth, latitude)
            obj = orb(
                f"L{depth}__{node['label']}__{safe(node['id'])}",
                position,
                node_sizes[depth],
                node_mat,
                level_collections[depth],
                subdivisions=2,
            )
            add_props(obj, node)
            visual_nodes[node["id"]] = obj
            positions[node["id"]] = position
            label_collection = label_l2_collection if depth == 2 else label_deep_collection
            label = make_text(
                f"TXT_L{depth}__{node['label']}__{safe(node['id'])}",
                node["label"],
                position + Vector((0, 0, node_sizes[depth] + 0.11)),
                0.095 if depth == 2 else 0.075,
                white,
                label_collection,
                camera,
            )
            label["dri_id"] = node["id"]
            label["dri_subtitle"] = node["subtitle"]

        for node in root_nodes:
            if not node["parent"]:
                continue
            start = positions[node["parent"]]
            end = positions[node["id"]]
            midpoint = (start + end) * 0.5
            midpoint = midpoint.normalized() * ((start.length + end.length) * 0.5 + 0.10)
            edge = curve_object(
                f"EDGE__{safe(node['parent'])}__{safe(node['id'])}",
                [start, midpoint, end],
                line_mat,
                connection_collection,
                0.010 if node["depth"] <= 2 else 0.006,
            )
            edge["dri_parent_id"] = node["parent"]
            edge["dri_child_id"] = node["id"]

    # Dynamic runtime graph layers are ready but hidden in presentation views.
    for name, label in (
        ("01_REACTIVOS_FALLIDOS", "Reactivos fallidos"),
        ("02_REACTIVOS_CORRECTOS", "Reactivos correctos"),
        ("03_FACTORES_Y_SEÑALES", "Factores y señales"),
        ("04_HIPOTESIS", "Hipótesis diagnósticas"),
        ("05_EVIDENCIAS", "Evidencias del caso"),
    ):
        target = collection(name, dynamic_collection)
        empty = bpy.data.objects.new(f"CAPA__{label}", None)
        target.objects.link(empty)
        empty.empty_display_type = "CIRCLE"
        empty.empty_display_size = 0.22
        empty["descripcion"] = label
        empty["nota"] = "Se llena dinámicamente según el caso DRI."

    # Soft architectural lighting; emission remains the main visual language.
    for name, location, energy, size, color in (
        ("LUZ__SUPERIOR", (3, -4, 12), 900, 5.5, (0.20, 0.65, 0.95)),
        ("LUZ__LATERAL", (-9, -5, 4), 650, 5.0, (0.15, 0.50, 0.85)),
        ("LUZ__POSTERIOR", (3, 10, 7), 780, 4.0, (0.20, 0.85, 0.88)),
    ):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        light = bpy.data.objects.new(name, data)
        light.location = location
        technical_collection.objects.link(light)
        look_at(light, (0, 0, 0))

    # View layers: clean overview, eight isolated systems, and full graph.
    overview = scene.view_layers[0]
    overview.name = "VL_00_INTERFAZ_LIMPIA"
    for name in detail_collections + connections_collections + label_l2_collections + label_deep_collections:
        exclude(overview, name)
    exclude(overview, dynamic_collection.name)

    for index, system_name in enumerate(system_collections, start=1):
        view_layer = scene.view_layers.new(f"VL_{index:02d}_{system_name.split('__', 1)[0]}")
        systems_layer = find_layer(view_layer.layer_collection, systems_collection.name)
        if systems_layer:
            for child in systems_layer.children:
                child.exclude = child.name != system_name
        exclude(view_layer, dynamic_collection.name)
        for surface_name in surface_collections:
            exclude(view_layer, surface_name)
        for deep_name in label_deep_collections:
            exclude(view_layer, deep_name)

    full = scene.view_layers.new("VL_09_GRAFO_COMPLETO")
    exclude(full, dynamic_collection.name)
    for name in surface_collections:
        exclude(full, name)
    for name in label_l2_collections + label_deep_collections:
        exclude(full, name)

    # Documentation embedded in the Blender file.
    readme = bpy.data.texts.new("LEEME_DRI_FUTURISTA.txt")
    readme.write(
        "DRI BA400 · INTERFAZ FUTURISTA ORGANIZADA\n\n"
        "VL_00_INTERFAZ_LIMPIA: ocho sectores, raíces y HUD.\n"
        "VL_01…VL_08: sistema aislado con su jerarquía y etiquetas L2.\n"
        "VL_09_GRAFO_COMPLETO: los 88 nodos organizados por sector y capa concéntrica.\n\n"
        "Capas radiales: L1 sistema (R=5.00), L2 subsistema (R=4.18), "
        "L3 componente (R=3.26), L4 microcomponente (R=2.34).\n"
        "Las etiquetas L3/L4 existen, pero se excluyen inicialmente para evitar ruido.\n"
        f"Fuente: {SOURCE.relative_to(ROOT)}\n"
    )
    manifest = bpy.data.texts.new("MANIFIESTO_DRI_88_ELEMENTOS.tsv")
    manifest.write("id\tparent_id\troot_id\tdepth\tlabel\tsubtitle\n")
    for node in nodes:
        manifest.write(
            f"{node['id']}\t{node['parent'] or ''}\t{node['root']}\t{node['depth']}\t{node['label']}\t{node['subtitle']}\n"
        )

    expected = {node["id"] for node in nodes}
    if set(visual_nodes) != expected:
        raise RuntimeError(f"Faltan nodos: {sorted(expected - set(visual_nodes))}")
    scene["dri_validation"] = "OK · 88/88 elementos"
    scene["dri_source"] = str(SOURCE.relative_to(ROOT))
    scene["dri_layout"] = "8 sectores angulares × 4 capas concéntricas"

    # Keep the clean view active when the file is opened.
    scene.render.filepath = str(PREVIEW)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    scene.compositing_node_group.nodes["Render Layers"].layer = overview.name
    bpy.ops.render.render(write_still=True, layer=overview.name)
    scene.render.filepath = str(GRAPH_PREVIEW)
    scene.compositing_node_group.nodes["Render Layers"].layer = full.name
    bpy.ops.render.render(write_still=True, layer=full.name)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    print(f"DRI_OUTPUT={OUTPUT}")
    print(f"DRI_PREVIEW={PREVIEW}")
    print(f"DRI_GRAPH_PREVIEW={GRAPH_PREVIEW}")
    print("DRI_VALIDATION=88/88")


if __name__ == "__main__":
    main()
