"""Skymaul: floating stone masses, copper bindings, lore-backed smith's hammer."""
from model_common import character, pivot, ball, plate, tube, rod, band, reset_pose, angles


def build(scene):
    c = character(scene, 'skymaul')
    body = c['body']
    ball(c, 'chest_stone', (0, .02, 1.12), (.38, .28, .34), 'stone', body, rings=3)
    head = pivot(c, 'head', (0, -.015, 1.68))
    ball(c, 'angular_head', (0, 0, 0), (.39, .29, .32), 'stone', head, segments=7, rings=3)
    plate(c, 'face_plane', ((-.25, -.08), (.25, -.08), (.22, .18), (-.13, .27)),
          .035, 'stone_light', head, center=(0, -.257, 0))
    band(c, 'head_copper_binding', (0, 0, -.16), (.36, .27), .045, 'copper', head)
    band(c, 'chest_core_rim', (0, -.265, 1.15), (.19, .19), .048, 'copper', body, axis='Y')
    ball(c, 'warm_core', (0, -.295, 1.15), (.137, .045, .137), 'amber', body, segments=10, rings=4)
    plate(c, 'team_chest_inset', ((-.27, -.09), (.25, -.09), (.29, .09), (-.29, .09)),
          .045, 'TEAM', body, center=(0, -.24, .83))
    for side, x, y in (('left', -.52, .035), ('right', .53, -.045)):
        arm = pivot(c, side + '_arm', (x, y, 1.28))
        ball(c, side + '_upper_stone', (0, 0, -.06), (.20, .22, .22), 'stone_light', arm, rings=3)
        band(c, side + '_arm_band', (0, 0, -.12), (.21, .23), .052, 'copper', arm)
        ball(c, side + '_fist', (0, -.03, -.42), (.24, .25, .26), 'stone', arm, rings=3)
        band(c, side + '_wrist_band', (0, -.03, -.28), (.23, .23), .055, 'copper', arm)
        for j, dx in enumerate((-.09, .08)):
            ball(c, side + '_knuckle_' + str(j), (dx, -.22, -.42), (.085, .08, .11),
                 'stone_light', arm, segments=6, rings=3)
    lower = pivot(c, 'lower_stones', (0, 0, .62))
    ball(c, 'floating_waist', (0, .025, 0), (.29, .23, .17), 'stone', lower, segments=7, rings=3)
    ball(c, 'floating_lower_left', (-.11, .02, -.26), (.17, .15, .12), 'stone_light', lower, segments=6, rings=3)
    ball(c, 'floating_lower_right', (.12, .04, -.47), (.12, .12, .10), 'stone', lower, segments=5, rings=3)
    ball(c, 'asymmetric_shoulder_chip', (-.57, .04, 1.68), (.09, .09, .12), 'stone', body, segments=5, rings=3)
    hammer = pivot(c, 'hammer', (0, -.08, -.40), c['rig']['right_arm'])
    rod(c, 'smith_hammer_handle', (0, .08, .07), (0, -.49, .07), .055, 'wood', hammer)
    plate(c, 'smith_hammer_head', ((-.34, -.13), (.32, -.13), (.37, -.04), (.32, .18), (-.33, .18), (-.38, .07)),
          .26, 'stone_light', hammer, center=(0, -.56, .07))
    plate(c, 'hammer_copper_collar', ((-.07, -.14), (.07, -.14), (.07, .19), (-.07, .19)),
          .28, 'copper', hammer, center=(0, -.56, .07))
    c['placement']['canon_additions'] = 'Held smith hammer from unchanged lore; TEAM lower chest panel from vector zone'
    return c


def pose(c, motion, phase):
    reset_pose(c)
    s = (0, 1, 0, -1)[phase]
    if motion == 'idle':
        c['body'].location.z = (0, .025, 0, -.018)[phase]
        angles(c['rig']['lower_stones'], y=s * 4)
    elif motion == 'walk':
        c['body'].location.z = (0, .07, 0, .035)[phase]
        angles(c['body'], x=5, z=s * 4)
        angles(c['rig']['left_arm'], x=s * 10, z=-4)
        angles(c['rig']['right_arm'], x=-s * 12, z=5)
        angles(c['rig']['lower_stones'], x=-s * 12)
    else:
        c['body'].location.y = (0, .07, -.13, -.025)[phase]
        angles(c['body'], x=(0, -6, 9, 2)[phase], z=(0, -7, 8, 2)[phase])
        angles(c['rig']['right_arm'], x=(0, -28, 30, 8)[phase], z=(0, 9, -8, 0)[phase])
        angles(c['rig']['hammer'], x=(0, -25, 30, 7)[phase])
        angles(c['rig']['left_arm'], x=(0, 12, -10, 0)[phase])
