"""STEP (ISO 10303-21) writer for the demo pack.

Emits AP214 faceted solids: planar faces bounded by poly loops. That is the
smallest STEP form that carries real solid geometry, so the files stay a few
kilobytes and remain readable in a diff, while still being genuine CAD data a
kernel can tessellate — Chronicle's 3D viewer renders them through OpenCascade.

Using poly loops avoids the edge-curve machinery (edge_curve, line, vector,
vertex_point per edge) that a full B-rep needs, which would quadruple the entity
count for no visible gain on box-shaped parts.
"""

from __future__ import annotations

from .mesh import Box, _FACES, _corners


class _Entities:
    """Sequentially numbered STEP entity instances."""

    def __init__(self) -> None:
        self._lines: list[str] = []

    def add(self, body: str) -> str:
        """Append an instance and return its `#id` reference."""
        reference = f"#{len(self._lines) + 1}"
        self._lines.append(f"{reference} = {body};")
        return reference

    def render(self) -> str:
        return "\n".join(self._lines)


def _point(entities: _Entities, xyz: tuple[float, float, float]) -> str:
    x, y, z = xyz
    return entities.add(f"CARTESIAN_POINT('',({x:g},{y:g},{z:g}))")


def _direction(entities: _Entities, xyz: tuple[float, float, float]) -> str:
    x, y, z = xyz
    return entities.add(f"DIRECTION('',({x:g},{y:g},{z:g}))")


def _plane_for_face(
    entities: _Entities,
    origin: tuple[float, float, float],
    normal: tuple[float, float, float],
) -> str:
    """A plane placed at `origin` with its axis along `normal`."""
    # Any direction perpendicular to the normal works as the reference axis.
    reference = (0.0, 0.0, 1.0) if normal[2] == 0 else (1.0, 0.0, 0.0)
    placement = entities.add(
        f"AXIS2_PLACEMENT_3D('',{_point(entities, origin)},"
        f"{_direction(entities, normal)},{_direction(entities, reference)})"
    )
    return entities.add(f"PLANE('',{placement})")


def _face_normal(
    a: tuple[float, float, float],
    b: tuple[float, float, float],
    c: tuple[float, float, float],
) -> tuple[float, float, float]:
    ux, uy, uz = b[0] - a[0], b[1] - a[1], b[2] - a[2]
    vx, vy, vz = c[0] - a[0], c[1] - a[1], c[2] - a[2]
    nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
    length = (nx * nx + ny * ny + nz * nz) ** 0.5 or 1.0
    return (nx / length, ny / length, nz / length)


def _solid(entities: _Entities, box: Box, name: str) -> str:
    """One box as a faceted B-rep solid, returning its entity reference."""
    corners = _corners(box)
    faces: list[str] = []
    for face in _FACES:
        loop_points = [corners[index] for index in face]
        normal = _face_normal(loop_points[0], loop_points[1], loop_points[2])
        plane = _plane_for_face(entities, loop_points[0], normal)
        points = ",".join(_point(entities, xyz) for xyz in loop_points)
        loop = entities.add(f"POLY_LOOP('',({points}))")
        bound = entities.add(f"FACE_OUTER_BOUND('',{loop},.T.)")
        faces.append(entities.add(f"ADVANCED_FACE('',({bound}),{plane},.T.)"))

    shell = entities.add(f"CLOSED_SHELL('',({','.join(faces)}))")
    return entities.add(f"FACETED_BREP('{name}',{shell})")


def boxes_to_step(boxes: list[Box], name: str, timestamp: str) -> str:
    """Write a set of boxes as one STEP part."""
    entities = _Entities()

    context = entities.add(
        "APPLICATION_CONTEXT('core data for automotive mechanical design processes')"
    )
    entities.add(
        f"APPLICATION_PROTOCOL_DEFINITION('international standard',"
        f"'automotive_design',2000,{context})"
    )
    product_context = entities.add(f"PRODUCT_CONTEXT('',{context},'mechanical')")
    product = entities.add(f"PRODUCT('{name}','{name}','',({product_context}))")
    formation = entities.add(f"PRODUCT_DEFINITION_FORMATION('','',{product})")
    definition_context = entities.add(
        f"PRODUCT_DEFINITION_CONTEXT('part definition',{context},'design')"
    )
    definition = entities.add(
        f"PRODUCT_DEFINITION('design','',{formation},{definition_context})"
    )
    shape = entities.add(f"PRODUCT_DEFINITION_SHAPE('','',{definition})")

    # Units: millimetres, radians, steradians, with a distance tolerance.
    length_unit = entities.add("( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )")
    angle_unit = entities.add("( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )")
    solid_angle_unit = entities.add(
        "( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )"
    )
    tolerance = entities.add(
        f"UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.01),{length_unit},"
        f"'distance_accuracy_value','confusion accuracy')"
    )
    geometric_context = entities.add(
        "( GEOMETRIC_REPRESENTATION_CONTEXT(3) "
        f"GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT(({tolerance})) "
        f"GLOBAL_UNIT_ASSIGNED_CONTEXT(({length_unit},{angle_unit},{solid_angle_unit})) "
        "REPRESENTATION_CONTEXT('','3D') )"
    )

    origin = _point(entities, (0.0, 0.0, 0.0))
    axis = entities.add(
        f"AXIS2_PLACEMENT_3D('',{origin},{_direction(entities, (0.0, 0.0, 1.0))},"
        f"{_direction(entities, (1.0, 0.0, 0.0))})"
    )
    solids = [_solid(entities, box, box.group) for box in boxes]
    representation = entities.add(
        f"FACETED_BREP_SHAPE_REPRESENTATION('{name}',({axis},{','.join(solids)}),"
        f"{geometric_context})"
    )
    entities.add(f"SHAPE_DEFINITION_REPRESENTATION({shape},{representation})")

    header = f"""ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('Chronicle demo asset'),'2;1');
FILE_NAME('{name}','{timestamp}',('Chronicle'),('Chronicle'),
  'scripts/demo_assets.py','Chronicle demo pack','');
FILE_SCHEMA(('AUTOMOTIVE_DESIGN {{ 1 0 10303 214 1 1 1 1 }}'));
ENDSEC;
DATA;"""
    return f"{header}\n{entities.render()}\nENDSEC;\nEND-ISO-10303-21;\n"


# --- The three STEP assets -------------------------------------------------


def mounting_bracket(version: int, timestamp: str) -> str:
    """An L-bracket: base + wall → thicker wall → gusset added."""
    wall_thickness = 8 if version == 1 else 12
    boxes = [
        Box(0, 0, 0, 80, 10, 50, "base"),
        Box(0, 10, 0, wall_thickness, 60, 50, "wall"),
    ]
    if version >= 3:
        boxes.append(Box(wall_thickness, 10, 20, 30, 30, 10, "gusset"))
    return boxes_to_step(boxes, "mounting-bracket", timestamp)


def enclosure(version: int, timestamp: str) -> str:
    """A housing: shell → taller shell → taller shell with a cable boss."""
    height = 40 if version == 1 else 60
    boxes = [Box(0, 0, 0, 120, height, 80, "housing")]
    if version >= 3:
        boxes.append(Box(120, height / 2 - 10, 30, 15, 20, 20, "cable-boss"))
    return boxes_to_step(boxes, "enclosure", timestamp)


def hinge_plate(version: int, timestamp: str) -> str:
    """A hinge plate: plate → plate with one knuckle → two knuckles."""
    boxes = [Box(0, 0, 0, 70, 6, 40, "plate")]
    if version >= 2:
        boxes.append(Box(70, 0, 4, 12, 12, 12, "knuckle-1"))
    if version >= 3:
        boxes.append(Box(70, 0, 24, 12, 12, 12, "knuckle-2"))
    return boxes_to_step(boxes, "hinge-plate", timestamp)
