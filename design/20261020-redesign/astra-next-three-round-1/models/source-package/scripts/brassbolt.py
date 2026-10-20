"""Brassbolt: animal-faced hooded ranger and wide brass crossbow."""
from model_common import character, pivot, ball, plate, tube, rod, band, leaf, humanoid_legs, reset_pose, angles


def build(scene):
    c = character(scene, 'brassbolt')
    body = c['body']
    humanoid_legs(c)
    ball(c, 'tunic', (0, .015, .97), (.29, .23, .38), 'leaf', body, rings=4)
    plate(c, 'team_tunic_front', ((-.21, -.26), (.20, -.26), (.24, .22), (-.22, .22)),
          .04, 'TEAM', body, center=(0, -.218, .99))
    plate(c, 'belt', ((-.25, -.04), (.25, -.04), (.25, .04), (-.25, .04)),
          .035, 'wood', body, center=(0, -.255, .81))
    plate(c, 'belt_buckle', ((-.055, -.045), (.055, -.045), (.055, .045), (-.055, .045)),
          .045, 'brass', body, center=(-.08, -.28, .81))
    head = pivot(c, 'head', (0, -.015, 1.47))
    ball(c, 'hood_back', (0, .06, .035), (.33, .27, .35), 'leaf', head, rings=4)
    ball(c, 'animal_face', (0, -.13, -.025), (.23, .20, .23), 'fur', head, rings=4)
    for side, x in (('left', -.175), ('right', .175)):
        plate(c, side + '_ear', ((-.08, 0), (.08, 0), (.025, .22)), .11, 'fur', head, center=(x, -.005, .23))
        ball(c, side + '_eye', (x * .61, -.304, .025), (.045, .024, .055), 'ink', head, segments=6, rings=3)
    ball(c, 'pale_muzzle', (0, -.295, -.105), (.15, .12, .085), 'bone', head, segments=8, rings=3)
    ball(c, 'dark_nose', (0, -.405, -.08), (.05, .035, .038), 'ink', head, segments=6, rings=3)
    tube(c, 'hood_tan_edging', ((-.27, -.17, -.18), (-.29, -.20, .13), (-.17, -.18, .30),
                               (0, -.18, .35), (.20, -.18, .25), (.29, -.18, .02), (.26, -.17, -.18)),
         .036, 'bone', head)
    plate(c, 'hood_drape', ((-.27, .18), (.28, .17), (.29, -.25), (.08, -.40), (-.23, -.30)),
          .055, 'leaf', body, center=(0, .25, 1.03))
    for side, x in (('left', -.30), ('right', .30)):
        arm = pivot(c, side + '_arm', (x, -.005, 1.19))
        rod(c, side + '_sleeve', (0, 0, 0), (x * .18, -.16, -.21), .11, 'leaf', arm)
        rod(c, side + '_bracer', (x * .18, -.16, -.21), (-x * .25, -.38, -.20), .085, 'wood', arm)
        ball(c, side + '_hand', (-x * .25, -.39, -.20), (.09, .10, .08), 'fur', arm, segments=6, rings=3)
    weapon = pivot(c, 'crossbow', (.045, -.40, .99))
    rod(c, 'crossbow_stock', (0, .25, 0), (0, -.60, 0), .07, 'wood', weapon, end_radius=.055)
    plate(c, 'crossbow_hinge', ((-.085, -.065), (.085, -.065), (.085, .065), (-.085, .065)),
          .16, 'brass', weapon, center=(0, -.28, 0))
    tube(c, 'crossbow_brass_limb', ((-.48, -.22, 0), (-.38, -.40, .025), (-.18, -.48, .03),
                                   (0, -.50, .03), (.20, -.48, .03), (.39, -.40, .025), (.48, -.22, 0)),
         .055, 'brass', weapon)
    tube(c, 'crossbow_string', ((-.48, -.22, 0), (0, .045, .025), (.48, -.22, 0)), .016, 'bone', weapon, sides=4)
    rod(c, 'loaded_bolt', (0, .16, .09), (0, -.70, .09), .020, 'wood', weapon)
    plate(c, 'bolt_tip', ((-.055, -.04), (.055, -.04), (0, .12)), .025,
          'brass', weapon, center=(0, -.71, .09)).rotation_euler.x = 1.5707963267948966
    for i, x in enumerate((-.045, .045)):
        plate(c, 'amber_bolt_fletch_' + str(i), ((0, -.025), (.07 if x > 0 else -.07, .035), (0, .095)),
              .025, 'amber', weapon, center=(x, .10, .095))
    quiver = pivot(c, 'quiver', (-.23, .23, 1.17))
    rod(c, 'quiver_case', (0, 0, -.25), (0, .015, .16), .105, 'wood', quiver)
    for i, x in enumerate((-.045, .045)):
        rod(c, 'quiver_bolt_' + str(i), (x, 0, .04), (x, 0, .34), .018, 'wood', quiver)
        leaf(c, 'quiver_amber_fletch_' + str(i), (x, 0, .27), .075, .16, 'amber', quiver, roll=15)
    c['placement']['canon_additions'] = 'Rear construction continuations; amber fletching from lore; TEAM tunic from vector zone'
    return c


def pose(c, motion, phase):
    reset_pose(c)
    s = (0, 1, 0, -1)[phase]
    if motion == 'idle':
        angles(c['rig']['head'], z=s * 2)
    elif motion == 'walk':
        c['body'].location.z = (0, .035, 0, .035)[phase]
        angles(c['rig']['left_leg'], x=s * 22)
        angles(c['rig']['right_leg'], x=-s * 22)
        angles(c['body'], x=4, z=s * 3)
        angles(c['rig']['crossbow'], x=6, z=-s * 2)
    else:
        c['body'].location.y = (0, .025, .065, .015)[phase]
        angles(c['body'], x=(0, -2, -5, -1)[phase])
        c['rig']['crossbow'].location.y += (0, -.025, -.15, -.04)[phase]
        angles(c['rig']['crossbow'], x=(0, -3, 9, 3)[phase])
        for side in ('left', 'right'):
            angles(c['rig'][side + '_arm'], x=(0, 3, -13, -4)[phase])
