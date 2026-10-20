"""Reedsting: wooden mask in a reed hood, tall bow, stitched lining marks."""
import math
from model_common import character, pivot, ball, plate, tube, rod, leaf, humanoid_legs, reset_pose, angles


def build(scene):
    c = character(scene, 'reedsting')
    body = c['body']
    humanoid_legs(c, radius=.075)
    ball(c, 'bark_torso', (0, .02, 1.00), (.235, .19, .34), 'wood', body, rings=3)
    plate(c, 'team_chest_sash', ((-.18, -.23), (.18, -.23), (.20, .22), (-.20, .22)),
          .045, 'TEAM', body, center=(0, -.18, 1.01))
    head = pivot(c, 'head', (0, -.01, 1.48))
    ball(c, 'reed_hood_back', (0, .045, .02), (.29, .24, .32), 'leaf', head, segments=7, rings=4)
    plate(c, 'hood_peak', ((-.29, -.13), (-.25, .17), (-.035, .38), (.26, .18), (.30, -.13)),
          .29, 'reed', head, center=(0, -.055, .02))
    plate(c, 'mask_dark_aperture', ((-.18, .17), (.18, .17), (.14, -.12), (0, -.28), (-.14, -.12)),
          .035, 'ink', head, center=(0, -.224, -.025))
    plate(c, 'wooden_mask_left', ((-.17, .16), (-.035, .17), (-.015, -.25), (-.13, -.11)),
          .035, 'heartwood', head, center=(0, -.255, -.025))
    plate(c, 'wooden_mask_right', ((.035, .17), (.17, .16), (.13, -.11), (.015, -.25)),
          .035, 'heartwood', head, center=(0, -.255, -.025))
    for side, x in (('left', -.085), ('right', .085)):
        ball(c, side + '_eye_socket', (x, -.278, .015), (.052, .022, .070), 'ink', head, segments=6, rings=3)
        ball(c, side + '_warm_eye', (x, -.30, .020), (.024, .015, .033), 'amber', head, segments=6, rings=3)
    tube(c, 'hood_inner_lip', ((-.24, -.23, -.17), (-.24, -.245, .17), (0, -.25, .31),
                             (.24, -.245, .17), (.24, -.23, -.17)), .033, 'heartwood', head)
    for i, x in enumerate((-.13, -.05, .03)):
        tube(c, 'lining_crossing_stitch_' + str(i), ((x, -.285, .238), (x + .025, -.285, .28)),
             .010, 'bone', head, sides=4)
    for i, (x, z, roll) in enumerate(((-.32, 1.23, -65), (.30, 1.21, 60), (-.26, .96, -25),
                                     (.24, .93, 28), (-.19, .72, -15), (.19, .71, 18))):
        leaf(c, 'layered_reed_' + str(i), (x, -.005, z), .23, .43, 'leaf' if i % 2 else 'reed', body, roll)
    leaf(c, 'asymmetric_hood_reed', (-.23, .03, 1.86), .13, .35, 'reed', body, roll=-24)
    left = pivot(c, 'left_arm', (-.26, -.005, 1.21))
    rod(c, 'left_upper_arm', (0, 0, 0), (-.17, -.18, -.13), .075, 'wood', left)
    rod(c, 'left_bow_arm', (-.17, -.18, -.13), (-.15, -.47, -.14), .065, 'wood', left)
    ball(c, 'left_grip', (-.15, -.48, -.14), (.08, .09, .08), 'heartwood', left, segments=6, rings=3)
    right = pivot(c, 'right_arm', (.27, -.005, 1.21))
    rod(c, 'right_upper_arm', (0, 0, 0), (.14, -.07, -.19), .075, 'wood', right)
    rod(c, 'right_draw_forearm', (.14, -.07, -.19), (-.13, -.28, -.16), .06, 'wood', right)
    ball(c, 'draw_hand', (-.13, -.28, -.16), (.075, .08, .075), 'heartwood', right, segments=6, rings=3)
    bow = pivot(c, 'bow', (-.41, -.49, 1.06))
    tube(c, 'slender_recurve_bow', ((0, -.02, -.67), (0, -.20, -.50), (0, -.31, -.25),
                                  (0, -.34, 0), (0, -.30, .28), (0, -.18, .53), (0, -.02, .70)),
         .038, 'heartwood', bow)
    tube(c, 'reed_bow_wrap', ((0, -.34, -.09), (0, -.34, .09)), .055, 'reed', bow)
    string = pivot(c, 'bow_string', (0, 0, 0), bow)
    tube(c, 'bow_string', ((0, -.02, -.67), (0, .19, 0), (0, -.02, .70)), .014, 'bone', string, sides=4)
    rod(c, 'reed_arrow_shaft', (0, .20, 0), (0, -.59, 0), .018, 'wood', bow)
    tip = plate(c, 'reed_arrow_tip', ((-.05, -.03), (.05, -.03), (0, .11)), .02,
                'bone', bow, center=(0, -.61, 0))
    tip.rotation_euler.x = math.pi / 2
    leaf(c, 'reed_arrow_cord', (0, .15, .035), .07, .16, 'reed', bow, roll=90)
    quiver = pivot(c, 'quiver', (.20, .23, 1.19))
    rod(c, 'reed_quiver', (0, 0, -.26), (0, 0, .22), .08, 'wood', quiver)
    for i, x in enumerate((-.035, .035)):
        rod(c, 'spare_arrow_' + str(i), (x, 0, .06), (x, 0, .39), .015, 'wood', quiver)
        leaf(c, 'spare_reed_fletch_' + str(i), (x, 0, .34), .08, .15, 'reed', quiver, roll=-12)
    c['placement']['canon_additions'] = 'Inner hood tally stitches from lore; TEAM chest sash from vector zone; hidden-side construction'
    return c


def pose(c, motion, phase):
    reset_pose(c)
    s = (0, 1, 0, -1)[phase]
    if motion == 'idle':
        angles(c['rig']['head'], z=s * 2)
    elif motion == 'walk':
        c['body'].location.z = (0, .035, 0, .035)[phase]
        angles(c['body'], x=3, z=s * 3)
        angles(c['rig']['left_leg'], x=s * 24)
        angles(c['rig']['right_leg'], x=-s * 24)
        angles(c['rig']['bow'], z=s * 5)
    else:
        angles(c['body'], x=(0, -2, 4, 1)[phase], z=(0, -6, 8, 2)[phase])
        c['rig']['bow'].location.y += (0, .02, -.11, -.03)[phase]
        angles(c['rig']['bow'], z=(0, -4, 5, 1)[phase])
        c['rig']['bow_string'].scale.y = (1, 1.45, .7, .95)[phase]
        angles(c['rig']['right_arm'], x=(0, -6, 12, 3)[phase], z=(0, -16, 26, 5)[phase])
        angles(c['rig']['left_arm'], x=(0, 0, -9, -2)[phase])
