"""Generate an editable Blender model of the DRI BA400 hierarchy.

The TypeScript hierarchy used by the application is parsed directly, so the
Blender file keeps the same ids, labels, subtitles, parent relationships and
depths as the DRI module.
"""

from __future__ import annotations

import math
import re
import sys
from collections import defaultdict
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "frontend/src/modules/dri/knowledge/ba400SubsystemHierarchy.ts"
OUTPUT = ROOT / "DRI_BA400_Esfera_Limpia.blend"
PREVIEW = ROOT / "DRI_BA400_Esfera_Limpia_preview.png"

SYSTEMS = [
    ("chemistry", "Programa analítico", "#22D3C5"),
    ("optics", "Sistema óptico", "#F4B942"),
    ("reaction", "Rotor de reacción", "#4F8FF7"),
    ("sample", "Rotor de muestras", "#32C48D"),
    ("reagent", "Rotor de reactivos", "#9A6BEB"),
    ("fluidics", "Sistema fluídico", "#27AEE4"),
    ("pipetting", "Brazos de pipeteo", "#EE5D7A"),
    ("wash", "Estación de lavado", "#6674E8"),
]

MECHANICAL_REFERENCES = [
    ("sample_arm", "Brazo de muestra"),
    ("reagent_arm_r1", "Brazo de reactivo R1"),
    ("reagent_arm_r2", "Brazo de reactivo R2"),
    ("reaction_rotor", "Rotor de reacción"),
    ("wash_station", "Estación de lavado"),
    ("optical_system", "Sistema óptico"),
    ("fridge", "Refrigeración de reactivos"),
    ("level_detection", "Detección de nivel"),
    ("barcode", "Lector de código de barras"),
    ("ise", "Módulo ISE"),
    ("clot_sensor", "Sensor de coágulo"),
    ("fluidics", "Sistema fluídico"),
    ("stirrer", "Brazo agitador"),
]


def safe_name(value: str) -> str:
    value = re.sub(r"[^0-9A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+", "_", value.strip())
    return value.strip("_")[:52]


def hex_rgba(value: str, alpha: float = 1.0) -> tuple[float, float, float, float]:
    value = value.lstrip("#")
    return tuple(int(value[index : index + 2], 16) / 255 for index in (0, 2, 4)) + (alpha,)


def parse_hierarchy() -> list[dict]:
    source = SOURCE.read_text(encoding="utf-8")
    block = source.split("const BA400_HIERARCHY:", 1)[1].split("];", 1)[0]
    pattern = re.compile(
        r"\{\s*id:\s*'([^']+)',\s*parentId:\s*(null|'[^']+'),\s*"
        r"rootId:\s*'([^']+)',\s*label:\s*'([^']+)',\s*"
        r"subtitle:\s*'([^']+)',\s*depth:\s*(\d)"
    )
    nodes = []
    for match in pattern.finditer(block):
        node_id, parent_raw, root_id, label, subtitle, depth = match.groups()
        nodes.append(
            {
                "id": node_id,
                "parent": None if parent_raw == "null" else parent_raw.strip("'"),
                "root": root_id,
                "label": label,
                "subtitle": subtitle,
                "depth": int(depth),
            }
        )
    if len(nodes) != 88:
        raise RuntimeError(f"Expected 88 DRI hierarchy nodes, found {len(nodes)}")
    return nodes


def clear_scene() -> None:
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for block in list(datablocks):
            datablocks.remove(block)
    for collection in list(bpy.data.collections):
        bpy.data.collections.remove(collection)


def new_collection(name: str, parent: bpy.types.Collection | None = None) -> bpy.types.Collection:
    collection = bpy.data.collections.new(name)
    (parent or bpy.context.scene.collection).children.link(collection)
    return collection


def link_object(obj: bpy.types.Object, collection: bpy.types.Collection) -> None:
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    collection.objects.link(obj)


def material(name: str, color: tuple[float, float, float, float], *, metallic=0.0, roughness=0.4, emission=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = color
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    if "Emission Color" in bsdf.inputs:
        bsdf.inputs["Emission Color"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    else:
        bsdf.inputs["Emission"].default_value = color
        bsdf.inputs["Emission Strength"].default_value = emission
    return mat


def spherical(radius: float, azimuth: float, latitude: float) -> Vector:
    return Vector(
        (
            radius * math.cos(latitude) * math.cos(azimuth),
            radius * math.cos(latitude) * math.sin(azimuth),
            radius * math.sin(latitude),
        )
    )


def make_wedge(name: str, az0: float, az1: float, mat, collection: bpy.types.Collection) -> bpy.types.Object:
    outer, inner = 5.0, 4.70
    az_steps, lat_steps = 12, 22
    lat0, lat1 = math.radians(-89.7), math.radians(89.7)
    vertices = []
    for radius in (outer, inner):
        for lat_index in range(lat_steps + 1):
            latitude = lat0 + (lat1 - lat0) * lat_index / lat_steps
            for az_index in range(az_steps + 1):
                azimuth = az0 + (az1 - az0) * az_index / az_steps
                vertices.append(tuple(spherical(radius, azimuth, latitude)))

    stride = az_steps + 1
    layer_size = stride * (lat_steps + 1)
    faces = []
    for layer in (0, 1):
        offset = layer * layer_size
        for lat_index in range(lat_steps):
            for az_index in range(az_steps):
                a = offset + lat_index * stride + az_index
                b = a + 1
                c = a + stride + 1
                d = a + stride
                faces.append((a, b, c, d) if layer == 0 else (d, c, b, a))

    # Close the four boundaries between the outer and inner shells.
    for lat_index in range(lat_steps):
        for az_index in (0, az_steps):
            out_a = lat_index * stride + az_index
            out_b = (lat_index + 1) * stride + az_index
            in_a = layer_size + out_a
            in_b = layer_size + out_b
            faces.append((out_a, in_a, in_b, out_b))
    for az_index in range(az_steps):
        for lat_index in (0, lat_steps):
            out_a = lat_index * stride + az_index
            out_b = out_a + 1
            in_a = layer_size + out_a
            in_b = layer_size + out_b
            faces.append((out_a, out_b, in_b, in_a))

    mesh = bpy.data.meshes.new(f"MESH__{name}")
    mesh.from_pydata(vertices, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    for polygon in mesh.polygons:
        polygon.use_smooth = True
    bevel = obj.modifiers.new("Bordes_suaves", "BEVEL")
    bevel.width = 0.025
    bevel.segments = 3
    return obj


def make_uv_sphere(name: str, location: Vector, radius: float, mat, collection: bpy.types.Collection):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=radius, location=location)
    obj = bpy.context.object
    obj.name = name
    link_object(obj, collection)
    obj.data.materials.append(mat)
    bevel = obj.modifiers.new("Suavizado", "BEVEL")
    bevel.width = radius * 0.08
    bevel.segments = 2
    return obj


def make_curve(name: str, points: list[Vector], mat, collection: bpy.types.Collection, width=0.018):
    curve = bpy.data.curves.new(name, "CURVE")
    curve.dimensions = "3D"
    curve.resolution_u = 2
    curve.bevel_depth = width
    curve.bevel_resolution = 2
    spline = curve.splines.new("BEZIER")
    spline.bezier_points.add(len(points) - 1)
    for point, coordinate in zip(spline.bezier_points, points):
        point.co = coordinate
        point.handle_left_type = "AUTO"
        point.handle_right_type = "AUTO"
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.data.materials.append(mat)
    return obj


def orient_outward(obj: bpy.types.Object, direction: Vector) -> None:
    obj.rotation_mode = "QUATERNION"
    obj.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(direction.normalized())


def make_text(name: str, body: str, location: Vector, size: float, mat, collection: bpy.types.Collection, *, extrude=0.004):
    curve = bpy.data.curves.new(name, "FONT")
    curve.body = body
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = extrude
    curve.bevel_depth = 0.0015
    curve.materials.append(mat)
    obj = bpy.data.objects.new(name, curve)
    collection.objects.link(obj)
    obj.location = location
    orient_outward(obj, location)
    return obj


def descendant_leaf_positions(nodes: list[dict], root_id: str) -> dict[str, float]:
    by_id = {node["id"]: node for node in nodes}
    children = defaultdict(list)
    for node in nodes:
        if node["parent"]:
            children[node["parent"]].append(node["id"])
    leaf_cursor = 0
    positions = {}

    def visit(node_id: str) -> float:
        nonlocal leaf_cursor
        child_ids = children.get(node_id, [])
        if not child_ids:
            value = float(leaf_cursor)
            leaf_cursor += 1
        else:
            child_values = [visit(child_id) for child_id in child_ids]
            value = sum(child_values) / len(child_values)
        positions[node_id] = value
        return value

    visit(root_id)
    maximum = max(positions.values(), default=1.0)
    if maximum == 0:
        return {key: 0.5 for key in positions}
    return {key: value / maximum for key, value in positions.items()}


def add_custom_properties(obj: bpy.types.Object, node: dict) -> None:
    obj["dri_id"] = node["id"]
    obj["dri_label"] = node["label"]
    obj["dri_subtitle"] = node["subtitle"]
    obj["dri_depth"] = node["depth"]
    obj["dri_parent_id"] = node["parent"] or ""
    obj["dri_root_id"] = node["root"]
    obj["source"] = "frontend/src/modules/dri/knowledge/ba400SubsystemHierarchy.ts"


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    direction = target - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def layer_collection_by_name(layer_collection, name: str):
    if layer_collection.name == name:
        return layer_collection
    for child in layer_collection.children:
        found = layer_collection_by_name(child, name)
        if found:
            return found
    return None


def main() -> None:
    nodes = parse_hierarchy()
    clear_scene()
    scene = bpy.context.scene
    scene.name = "DRI_BA400_Esfera"
    scene["dri_source"] = str(SOURCE.relative_to(ROOT))
    scene["dri_hierarchy_node_count"] = len(nodes)
    scene["dri_system_count"] = len(SYSTEMS)
    scene["instrucciones"] = "Usa las colecciones 02_SISTEMAS_DRI y las View Layers para aislar cada sistema."

    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = str(PREVIEW)
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.view_settings.look = "AgX - Medium High Contrast"
    scene.world.color = (0.004, 0.008, 0.016)
    world_nodes = scene.world.node_tree.nodes if scene.world.use_nodes else None
    if world_nodes:
        world_nodes["Background"].inputs["Color"].default_value = (0.003, 0.008, 0.018, 1)
        world_nodes["Background"].inputs["Strength"].default_value = 0.16

    guides = new_collection("00_CAMARAS_Y_LUCES")
    core_collection = new_collection("01_NUCLEO_DRI")
    systems_collection = new_collection("02_SISTEMAS_DRI")
    dynamic_collection = new_collection("03_CAPAS_DINAMICAS_DEL_CASO")
    references_collection = new_collection("04_REFERENCIAS_TECNICAS")

    white = material("MAT__Texto", (0.92, 0.97, 1.0, 1), metallic=0.0, roughness=0.3, emission=0.6)
    dark = material("MAT__Nucleo", (0.012, 0.028, 0.06, 1), metallic=0.75, roughness=0.18)
    guide_mat = material("MAT__Guias", (0.14, 0.26, 0.42, 1), metallic=0.35, roughness=0.35, emission=0.15)

    core = make_uv_sphere("NUCLEO__DRI_BA400", Vector((0, 0, 0)), 4.55, dark, core_collection)
    core["descripcion"] = "Núcleo visual; los 8 sectores externos representan los sistemas del DRI."

    node_by_id = {node["id"]: node for node in nodes}
    hierarchy_objects = {}
    hierarchy_positions = {}
    system_collection_names = []
    detail_collection_names = []

    gap = math.radians(3.6)
    width = math.tau / len(SYSTEMS)
    depth_radius = {1: 5.18, 2: 5.46, 3: 5.78, 4: 6.10}
    depth_node_size = {2: 0.145, 3: 0.105, 4: 0.085}

    for system_index, (root_key, system_label, color_hex) in enumerate(SYSTEMS):
        index_label = f"{system_index + 1:02d}"
        system_prefix = f"{index_label}_{root_key.upper()}"
        system_collection = new_collection(f"{system_prefix}__{safe_name(system_label)}", systems_collection)
        system_collection_names.append(system_collection.name)
        sector_collection = new_collection(f"{system_prefix}__00_SECTOR_ESFERA", system_collection)
        details_collection = new_collection(f"{system_prefix}__01_DETALLE_JERARQUIA", system_collection)
        detail_collection_names.append(details_collection.name)
        level_collections = {
            2: new_collection(f"{system_prefix}__02_SUBSISTEMAS", details_collection),
            3: new_collection(f"{system_prefix}__03_COMPONENTES", details_collection),
            4: new_collection(f"{system_prefix}__04_MICROCOMPONENTES", details_collection),
        }
        connection_collection = new_collection(f"{system_prefix}__05_CONEXIONES", details_collection)
        label_collections = {
            1: new_collection(f"{system_prefix}__06_ETIQUETA_SISTEMA", details_collection),
            2: new_collection(f"{system_prefix}__07_ETIQUETAS_L2", details_collection),
            3: new_collection(f"{system_prefix}__08_ETIQUETAS_L3", details_collection),
            4: new_collection(f"{system_prefix}__09_ETIQUETAS_L4", details_collection),
        }
        # Deep labels exist and remain editable, but start hidden to avoid clutter.
        label_collections[3].hide_viewport = True
        label_collections[3].hide_render = True
        label_collections[4].hide_viewport = True
        label_collections[4].hide_render = True

        base_color = hex_rgba(color_hex)
        sector_mat = material(f"MAT__{system_prefix}__Sector", base_color, metallic=0.18, roughness=0.40, emission=0.025)
        node_mat = material(
            f"MAT__{system_prefix}__Nodos",
            tuple(min(1.0, channel * 1.05) for channel in base_color[:3]) + (1.0,),
            metallic=0.15,
            roughness=0.24,
            emission=0.28,
        )
        connection_mat = material(
            f"MAT__{system_prefix}__Conexiones",
            tuple(channel * 0.82 for channel in base_color[:3]) + (1.0,),
            metallic=0.1,
            roughness=0.35,
            emission=0.18,
        )

        center_az = system_index * width
        az0 = center_az - width / 2 + gap / 2
        az1 = center_az + width / 2 - gap / 2
        root_node = next(node for node in nodes if node["root"] == root_key and node["depth"] == 1)
        wedge = make_wedge(f"L1__{root_node['label']}", az0, az1, sector_mat, sector_collection)
        add_custom_properties(wedge, root_node)
        hierarchy_objects[root_node["id"]] = wedge
        root_position = spherical(depth_radius[1], center_az, 0)
        hierarchy_positions[root_node["id"]] = root_position

        title_position = spherical(5.24, center_az, 0)
        title = make_text(
            f"TXT_L1__{root_node['label']}",
            f"{index_label}  {root_node['label'].upper()}",
            title_position,
            0.22,
            white,
            label_collections[1],
            extrude=0.008,
        )
        title["dri_id"] = root_node["id"]
        title.parent = wedge

        root_nodes = [node for node in nodes if node["root"] == root_key]
        normalized_positions = descendant_leaf_positions(root_nodes, root_node["id"])
        for node in root_nodes:
            if node["depth"] == 1:
                continue
            depth = node["depth"]
            normalized = normalized_positions[node["id"]]
            latitude = math.radians(-66 + normalized * 132)
            depth_offset = {2: -0.25, 3: 0.0, 4: 0.25}[depth]
            azimuth = center_az + depth_offset * (width / 2 - gap)
            position = spherical(depth_radius[depth], azimuth, latitude)
            obj = make_uv_sphere(
                f"L{depth}__{node['label']}__{safe_name(node['id'])}",
                position,
                depth_node_size[depth],
                node_mat,
                level_collections[depth],
            )
            add_custom_properties(obj, node)
            obj.parent = wedge
            hierarchy_objects[node["id"]] = obj
            hierarchy_positions[node["id"]] = position

            label_position = position.normalized() * (position.length + depth_node_size[depth] + 0.075)
            label_body = node["label"] if depth == 2 else f"{node['label']}\n{node['subtitle']}"
            label = make_text(
                f"TXT_L{depth}__{node['label']}__{safe_name(node['id'])}",
                label_body,
                label_position,
                0.145 if depth == 2 else 0.105,
                white,
                label_collections[depth],
                extrude=0.002,
            )
            label["dri_id"] = node["id"]
            label["dri_subtitle"] = node["subtitle"]
            label.parent = obj
            label.matrix_parent_inverse = obj.matrix_world.inverted()

        # Curves follow the spherical shell and preserve the exact parent tree.
        for node in root_nodes:
            if not node["parent"]:
                continue
            start = hierarchy_positions[node["parent"]]
            end = hierarchy_positions[node["id"]]
            midpoint = (start.normalized() + end.normalized()).normalized() * max(start.length, end.length, 5.55)
            connection = make_curve(
                f"EDGE__{safe_name(node['parent'])}__A__{safe_name(node['id'])}",
                [start, midpoint, end],
                connection_mat,
                connection_collection,
                width=0.014 if node["depth"] < 4 else 0.010,
            )
            connection["dri_parent_id"] = node["parent"]
            connection["dri_child_id"] = node["id"]
            connection.parent = wedge

    # Runtime-only graph layers: the application fills these per diagnostic case.
    dynamic_layers = [
        ("01_REACTIVOS_FALLIDOS", "Reactivos fallidos"),
        ("02_REACTIVOS_CORRECTOS", "Reactivos correctos"),
        ("03_FACTORES_Y_SEÑALES", "Factores y señales"),
        ("04_HIPOTESIS", "Hipótesis diagnósticas"),
        ("05_EVIDENCIAS", "Evidencias del caso"),
    ]
    for layer_name, description in dynamic_layers:
        collection = new_collection(layer_name, dynamic_collection)
        empty = bpy.data.objects.new(f"CAPA_DINAMICA__{description}", None)
        collection.objects.link(empty)
        empty.empty_display_type = "SPHERE"
        empty.empty_display_size = 0.3
        empty["descripcion"] = description
        empty["nota"] = "Contenido variable según el caso ejecutado en el módulo DRI."

    for mechanical_id, label in MECHANICAL_REFERENCES:
        empty = bpy.data.objects.new(f"REF__{label}", None)
        references_collection.objects.link(empty)
        empty.empty_display_type = "PLAIN_AXES"
        empty.empty_display_size = 0.18
        empty["dri_mechanical_subsystem_id"] = mechanical_id
        empty["dri_label"] = label
    references_collection.hide_viewport = True
    references_collection.hide_render = True

    # Camera, lighting and a clean presentation setup.
    camera_data = bpy.data.cameras.new("CAM__DRI_Principal")
    camera = bpy.data.objects.new("CAM__DRI_Principal", camera_data)
    guides.objects.link(camera)
    camera.location = Vector((13.8, -13.8, 10.8))
    camera_data.lens = 58
    look_at(camera, Vector((0, 0, 0.15)))
    scene.camera = camera

    for name, location, energy, size, color in (
        ("LUZ__Principal", (8, -8, 12), 1550, 6.0, (0.72, 0.86, 1.0)),
        ("LUZ__Relleno", (-10, -3, 5), 1150, 5.0, (0.48, 0.72, 1.0)),
        ("LUZ__Contorno", (2, 10, 9), 1800, 4.0, (0.36, 0.92, 0.94)),
    ):
        light_data = bpy.data.lights.new(name, "AREA")
        light_data.energy = energy
        light_data.shape = "DISK"
        light_data.size = size
        light_data.color = color
        light = bpy.data.objects.new(name, light_data)
        light.location = location
        guides.objects.link(light)
        look_at(light, Vector((0, 0, 0)))

    # One view layer per system gives immediate isolation without changing collections.
    complete_layer = scene.view_layers[0]
    complete_layer.name = "VL_00_ESFERA_LIMPIA"
    for detail_name in detail_collection_names:
        detail_layer = layer_collection_by_name(complete_layer.layer_collection, detail_name)
        if detail_layer:
            detail_layer.exclude = True
    dynamic_layer = layer_collection_by_name(complete_layer.layer_collection, dynamic_collection.name)
    if dynamic_layer:
        dynamic_layer.exclude = True
    references_layer = layer_collection_by_name(complete_layer.layer_collection, references_collection.name)
    if references_layer:
        references_layer.exclude = True
    for system_index, collection_name in enumerate(system_collection_names, start=1):
        view_layer = scene.view_layers.new(f"VL_{system_index:02d}_{collection_name.split('__', 1)[0]}")
        systems_layer = layer_collection_by_name(view_layer.layer_collection, systems_collection.name)
        if systems_layer:
            for child in systems_layer.children:
                child.exclude = child.name != collection_name

    # Embedded documentation and a searchable manifest travel with the .blend.
    instructions = bpy.data.texts.new("LEEME_DRI.txt")
    instructions.write(
        "DRI BA400 · ESFERA ORGANIZADA\n\n"
        "- VL_00_ESFERA_LIMPIA muestra solamente los 8 sectores, sin ruido visual.\n"
        "- 02_SISTEMAS_DRI contiene un gajo por sistema.\n"
        "- 01_DETALLE_JERARQUIA contiene subsistemas, componentes, microcomponentes, conexiones y etiquetas.\n"
        "- Las etiquetas L3/L4 inician ocultas; actívalas únicamente cuando las necesites.\n"
        "- Las View Layers VL_01…VL_08 aíslan un sistema y muestran su jerarquía.\n"
        "- Todos los objetos incluyen propiedades DRI en Object Properties > Custom Properties.\n"
        "- 03_CAPAS_DINAMICAS_DEL_CASO reserva reactivos, factores, hipótesis y evidencias.\n"
        f"- Fuente: {SOURCE.relative_to(ROOT)}\n"
        f"- Elementos estáticos: {len(nodes)}.\n"
    )
    manifest = bpy.data.texts.new("MANIFIESTO_JERARQUIA_DRI.tsv")
    manifest.write("id\tparent_id\troot_id\tdepth\tlabel\tsubtitle\n")
    for node in nodes:
        manifest.write(
            f"{node['id']}\t{node['parent'] or ''}\t{node['root']}\t{node['depth']}\t{node['label']}\t{node['subtitle']}\n"
        )

    # Validate that every source node became exactly one hierarchy object.
    if set(hierarchy_objects) != set(node_by_id):
        missing = set(node_by_id) - set(hierarchy_objects)
        raise RuntimeError(f"Missing hierarchy objects: {sorted(missing)}")
    scene["dri_validation"] = "OK · 88/88 elementos modelados"

    bpy.context.view_layer.objects.active = core
    core.select_set(True)
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    bpy.ops.render.render(write_still=True)
    # Save once more so the render result and final state are included.
    bpy.ops.wm.save_as_mainfile(filepath=str(OUTPUT))
    print(f"DRI_OUTPUT={OUTPUT}")
    print(f"DRI_PREVIEW={PREVIEW}")
    print(f"DRI_NODES={len(nodes)}")
    print(f"DRI_SYSTEMS={len(SYSTEMS)}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"DRI_GENERATION_ERROR={exc}", file=sys.stderr)
        raise
