"""Skymaul R2: lifted basalt masses, warm kiln core, compact centered smith hammer."""
import itertools
import math

ACTOR_REST_LIFT = 1.40
UPPER_PIVOT_Z = 1.05
ARM_PIVOT = (.72, .65, 1.85)
FOREARM = .35
GRIP = (0, 0, -FOREARM)
CARRY_HEAD = (0, 0, 2.42)
CARRY_GRIP = (ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2] - FOREARM)
HAMMER_LENGTH = math.dist(CARRY_HEAD, CARRY_GRIP)


def add(a, b):
    return tuple(x + y for x, y in zip(a, b))


def scale(a, s):
    return tuple(x * s for x in a)


def dot(a, b):
    return sum(x * y for x, y in zip(a, b))


def cross(a, b):
    return (a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0])


def unit(v):
    return scale(v, 1 / math.sqrt(dot(v, v)))


def apply(matrix, v):
    return tuple(dot(row, v) for row in matrix)


def transpose(matrix):
    return tuple(zip(*matrix))


def multiply(a, b):
    return tuple(tuple(dot(row, col) for col in zip(*b)) for row in a)


def rotation(xyz):
    x, y, z = map(math.radians, xyz)
    cx, sx, cy, sy, cz, sz = math.cos(x), math.sin(x), math.cos(y), math.sin(y), math.cos(z), math.sin(z)
    return ((cz*cy, cz*sy*sx-sz*cx, cz*sy*cx+sz*sx),
            (sz*cy, sz*sy*sx+cz*cx, sz*sy*cx-cz*sx), (-sy, cy*sx, cy*cx))


def aim(direction):
    z = unit(direction)
    x = unit(cross((0, 1, 0), z))
    y = cross(z, x)
    return transpose((x, y, z))


CARRY_BASIS = aim(add(CARRY_HEAD, scale(CARRY_GRIP, -1)))


def block(radii, bevel):
    vertices, indices, faces = [], {}, []
    signs = tuple(itertools.product((-1, 1), repeat=3))
    for sign in signs:
        for axis in range(3):
            indices[sign, axis] = len(vertices)
            vertices.append(tuple(sign[i] * (radii[i] if i == axis else radii[i]-bevel) for i in range(3)))
    for axis in range(3):
        for sign in (-1, 1):
            others = [a for a in range(3) if a != axis]
            corner = []
            for a, b in ((-1, -1), (-1, 1), (1, 1), (1, -1)):
                s = [sign] * 3
                s[others[0]], s[others[1]] = a, b
                corner.append(indices[tuple(s), axis])
            faces.append(tuple(corner))
    for a, b in ((0, 1), (0, 2), (1, 2)):
        c = 3-a-b
        for sa, sb in itertools.product((-1, 1), repeat=2):
            s = [0, 0, 0]
            s[a], s[b], s[c] = sa, sb, -1
            lo = tuple(s)
            s[c] = 1
            hi = tuple(s)
            faces.append((indices[lo, a], indices[hi, a], indices[hi, b], indices[lo, b]))
    faces.extend(tuple(indices[s, a] for a in range(3)) for s in signs)
    oriented = []
    for face in faces:
        a, b, c = (vertices[i] for i in face[:3])
        normal = cross(add(b, scale(a, -1)), add(c, scale(a, -1)))
        center = tuple(sum(vertices[i][j] for i in face)/len(face) for j in range(3))
        oriented.append(face if dot(normal, center) > 0 else tuple(reversed(face)))
    return vertices, oriented


def band_mesh(radii, tube, axis='Z', segments=12, sides=6):
    vertices = []
    for i in range(segments):
        a = math.tau*i/segments
        for j in range(sides):
            b = math.tau*j/sides
            point = ((radii[0]+tube*math.cos(b))*math.cos(a),
                     (radii[1]+tube*math.cos(b))*math.sin(a), tube*math.sin(b))
            vertices.append(point if axis == 'Z' else (point[0], point[2], point[1]))
    faces = []
    for i in range(segments):
        for j in range(sides):
            face = (i*sides+j, ((i+1)%segments)*sides+j,
                    ((i+1)%segments)*sides+(j+1)%sides, i*sides+(j+1)%sides)
            faces.append(face if axis == 'Z' else tuple(reversed(face)))
    return vertices, faces


def core_mesh():
    vertices, count = [], 12
    for y, rx, rz in ((-.12, .245, .21), (-.32, .26, .23), (-.55, .20, .18)):
        for i in range(count):
            a = math.tau*i/count
            vertices.append((rx*math.cos(a), y, rz*math.sin(a)))
    vertices.extend(((0, -.57, 0), (0, -.12, 0)))
    faces = []
    for layer in range(2):
        for i in range(count):
            j = (i+1)%count
            faces.append((layer*count+i, (layer+1)*count+i, (layer+1)*count+j, layer*count+j))
    faces.extend((2*count+i, 3*count, 2*count+(i+1)%count) for i in range(count))
    faces.extend(((i+1)%count, 3*count+1, i) for i in range(count))
    return vertices, [tuple(reversed(face)) for face in faces]


def cylinder(radius, start_z, end_z, sides=8):
    vertices = [(radius*math.cos(math.tau*i/sides), radius*math.sin(math.tau*i/sides), z)
                for z in (start_z, end_z) for i in range(sides)]
    faces = [tuple(reversed(range(sides))), tuple(range(sides, 2*sides))]
    faces.extend((i, (i+1)%sides, (i+1)%sides+sides, i+sides) for i in range(sides))
    return vertices, faces


def rig_specs():
    return {
        'upper_cluster': ('body', (0, 0, UPPER_PIVOT_Z)),
        'head': ('upper_cluster', (0, -.015, 2.12-UPPER_PIVOT_Z)),
        'left_arm': ('upper_cluster', (-ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]-UPPER_PIVOT_Z)),
        'right_arm': ('upper_cluster', (ARM_PIVOT[0], ARM_PIVOT[1], ARM_PIVOT[2]-UPPER_PIVOT_Z)),
        'lower_stones': ('body', (0, 0, .68)),
        'hammer': ('right_arm', GRIP),
    }


def geometry_specs():
    specs = []
    def mesh(name, geometry, material, parent, center=(0, 0, 0), xyz=(0, 0, 0), top=False):
        vertices, faces = geometry
        rot = rotation(xyz)
        specs.append({'name': name, 'vertices': [apply(rot, v) for v in vertices], 'faces': faces,
                      'material': material, 'parent': parent, 'center': center, 'top': top})
    mesh('chest_stone', block((.23, .17, .17), .06), 'stone', 'upper_cluster', (0, .02, -.03))
    mesh('angular_head', block((.18, .15, .18), .06), 'stone', 'head', top=True)
    mesh('head_copper_binding', band_mesh((.16, .13), .035), 'copper', 'head', (0, 0, -.04))
    mesh('warm_core', core_mesh(), 'amber', 'upper_cluster', (0, 0, -.03))
    mesh('chest_core_rim', band_mesh((.23, .20), .04, axis='Y'), 'copper', 'upper_cluster', (0, -.08, -.03))
    mesh('team_chest_inset', block((.20, .025, .055), .015), 'TEAM', 'upper_cluster', (0, .20, -.14))
    for side, sign in (('left', -1), ('right', 1)):
        mesh(side+'_fist', block((.23, .18, .24), .07), 'stone', side+'_arm', GRIP)
        mesh(side+'_wrist_band', band_mesh((.20, .15), .07), 'copper', side+'_arm', (0, 0, -.21))
        mesh(side+'_shoulder_ring', band_mesh((.17, .14), .07), 'copper', 'upper_cluster',
             (sign*.57, .61, 1.70-UPPER_PIVOT_Z), (22, sign*25, 0))
    mesh('floating_waist', block((.36, .16, .12), .05), 'stone', 'lower_stones')
    mesh('smith_hammer_handle', cylinder(.045, -.08, HAMMER_LENGTH-.18/CARRY_BASIS[2][2]+.01), 'wood', 'hammer')
    inv = transpose(CARRY_BASIS)
    vertices, faces = block((.22, .22, .18), .04)
    vertices = [add(apply(inv, v), (0, 0, HAMMER_LENGTH)) for v in vertices]
    specs.append({'name': 'smith_hammer_head', 'vertices': vertices, 'faces': faces, 'material': 'stone',
                  'parent': 'hammer', 'center': (0, 0, 0), 'top': True})
    vertices, faces = band_mesh((.20, .20), .045)
    vertices = [add(apply(inv, add(v, (0, 0, -.14))), (0, 0, HAMMER_LENGTH)) for v in vertices]
    specs.append({'name': 'hammer_copper_collar', 'vertices': vertices, 'faces': faces, 'material': 'copper',
                  'parent': 'hammer', 'center': (0, 0, 0), 'top': False})
    return specs


def attack_arm_and_hammer(target):
    d = add(target, scale(ARM_PIVOT, -1))
    a, b = -2*FOREARM*d[1], 2*FOREARM*d[2]
    c = HAMMER_LENGTH**2-dot(d, d)-FOREARM**2
    angle = math.atan2(a, b)-math.acos(c/math.hypot(a, b))
    xyz = (math.degrees(angle), 0, 0)
    grip = add(ARM_PIVOT, apply(rotation(xyz), GRIP))
    return xyz, aim(add(target, scale(grip, -1)))


def pose_spec(motion, phase):
    upper, left, right = (0, 0, 0), (0, 0, 0), (0, 0, 0)
    hammer = CARRY_BASIS
    if motion == 'walk':
        upper = ((0, 5, 0, -3)[phase], 0, 0)
        left = ((0, 45, 0, -20)[phase], 0, 0)
    elif motion == 'attack':
        upper = ((0, -4, 0, 2)[phase], 0, 0)
        left = ((0, -15, 25, 0)[phase], 0, 0)
        if phase:
            target = ((0, 0, 2.42), (0, .10, 2.58), (0, -.18, 2.64), (0, -.02, 2.52))[phase]
            right, hammer = attack_arm_and_hammer(target)
    return {'upper_cluster': rotation(upper), 'left_arm': rotation(left), 'right_arm': rotation(right),
            'hammer': multiply(transpose(rotation(right)), hammer)}


def build(scene):
    from model_common import character, pivot, p
    c = character(scene, 'skymaul')
    c['body'].location.z = ACTOR_REST_LIFT
    objects = {'body': c['body']}
    for name, (parent, center) in rig_specs().items():
        objects[name] = pivot(c, name, center, objects[parent])
    for spec in geometry_specs():
        obj = p.mesh(c['collection'], c['id']+'_'+spec['name'], spec['vertices'], spec['faces'],
                     spec['material'], objects[spec['parent']], smooth=False)
        obj.location = spec['center']
        if spec['top']:
            obj.data.materials.append(c['materials']['stone_light'])
            obj.data.polygons[5].material_index = 1
    c['placement']['model_revision'] = 'ART-3D-SKY-002 round 2; Claude reviewed compact floating smith'
    c['placement']['actor_rest_lift'] = ACTOR_REST_LIFT
    c['placement']['constant_lift_contract'] = 'Actor rest location only; exact ground anchor/rings; no animated translation'
    c['placement']['hammer_ownership'] = 'right_arm; fixed-length handle through right fist grip'
    return c


def pose(c, motion, phase):
    from mathutils import Matrix
    from model_common import reset_pose
    reset_pose(c)
    for name, matrix in pose_spec(motion, phase).items():
        c['rig'][name].rotation_euler = Matrix(matrix).to_euler('XYZ')
