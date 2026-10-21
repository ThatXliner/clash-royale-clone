"""Exact R3 portrait raster/mask functions used by the accepted R4 derivative."""
import statistics
import bpy


def alpha_metrics(path, png):
    width, height, pixels = png.read_rgba(path)
    bounds = png.bounds(width, height, pixels, 1)
    if bounds is None:
        raise RuntimeError('Empty portrait')
    edges = {'top': sum(pixels[x * 4 + 3] >= 1 for x in range(width)),
             'bottom': sum(pixels[((height - 1) * width + x) * 4 + 3] >= 1 for x in range(width)),
             'left': sum(pixels[(y * width) * 4 + 3] >= 1 for y in range(height)),
             'right': sum(pixels[(y * width + width - 1) * 4 + 3] >= 1 for y in range(height))}
    margins = {'left': bounds['left'] / width, 'top': bounds['top'] / height,
               'right': (width - bounds['left'] - bounds['width']) / width,
               'bottom': (height - bounds['top'] - bounds['height']) / height}
    fill = bounds['height'] / height
    checks = {'size_512': [width, height] == [512, 512], 'height_fill_76_to_81': .76 <= fill <= .81,
              'top_margin_min_9': margins['top'] >= .09, 'bottom_margin_min_9': margins['bottom'] >= .09,
              'left_margin_min_6': margins['left'] >= .06, 'right_margin_min_6': margins['right'] >= .06,
              'all_edges_alpha_zero': sum(edges.values()) == 0}
    return {'threshold': 1, 'threshold_rule': 'alpha >= 1, every nonzero alpha pixel',
            'bounds': bounds, 'clear_margins_normalized': margins, 'height_fill': fill,
            'edge_pixel_counts': edges, 'checks': checks, 'all_checks_pass': all(checks.values())}


def portrait(scene, char, output, helper, pipe, ev):
    from render_saved import png
    before = helper.snapshot(scene, char)
    meshes = pipe.scene_meshes(scene)
    originals = {obj: list(obj.data.materials) for obj in meshes}
    visibility = {obj: (obj.hide_render, obj.hide_viewport) for obj in meshes}
    view = (scene.view_settings.view_transform, scene.view_settings.look,
            scene.view_settings.exposure, scene.view_settings.gamma)
    temporary = []
    try:
        for obj in char['presentation'].objects:
            obj.hide_render = obj.hide_viewport = True
        scene.camera = char['portrait_camera']
        scene.render.resolution_x = scene.render.resolution_y = 512
        scene.frame_set(1, subframe=0)
        color_path = output / 'skymaul-portrait.png'
        scene.render.filepath = str(color_path)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        alpha = alpha_metrics(color_path, png)
        helper.write(output / 'portrait-alpha-metrics.json', alpha)
        if not alpha['all_checks_pass']:
            raise RuntimeError('First saved portrait failed pinned alpha gates; retain output, do not change camera')
        white = ev.emission_material((1, 1, 1), 'R3_CORE_WHITE')
        black = ev.emission_material((0, 0, 0), 'R3_CORE_BLACK')
        temporary = [white, black]
        pipe.enum_readback(scene.view_settings, 'view_transform', ('Raw',))
        pipe.enum_readback(scene.view_settings, 'look', ('None',))
        scene.view_settings.exposure, scene.view_settings.gamma = 0, 1
        core_name = 'ME_SBR_R1_skymaul_warm_core'
        for obj in meshes:
            if obj.get('presentation_ground_marker'):
                continue
            for index in range(len(obj.data.materials)):
                obj.data.materials[index] = white if obj.name == core_name else black
        visible_path = output / 'portrait-core-visible.png'
        scene.render.filepath = str(visible_path)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        for obj in meshes:
            if not obj.get('presentation_ground_marker'):
                obj.hide_render = obj.hide_viewport = obj.name != core_name
        isolated_path = output / 'portrait-core-isolated.png'
        scene.render.filepath = str(isolated_path)
        bpy.ops.render.render(write_still=True, scene=scene.name)
        width, height, color = png.read_rgba(color_path)
        _, _, visible = png.read_rgba(visible_path)
        _, _, isolated = png.read_rgba(isolated_path)
        visible_support = {i for i in range(width * height) if round(visible[i*4] * visible[i*4+3] / 255) >= 128}
        isolated_support = {i for i in range(width * height) if isolated[i*4+3] >= 128}
        occluded = sorted(isolated_support - visible_support)
        def luminance(indices):
            values = [(.2126 * color[i*4] + .7152 * color[i*4+1] + .0722 * color[i*4+2]) / 255 for i in indices]
            return {'pixels': len(values), 'min': min(values) if values else None,
                    'median': statistics.median(values) if values else None, 'max': max(values) if values else None}
        actor_support = {i for i in range(width * height) if color[i*4+3] >= 128}
        core_bounds = png.bounds(width, height, isolated, 1)
        helper.write(output / 'portrait-core-diagnostics.json', {
            'status': 'diagnostics for independent whole-core, occlusion and lightest-region review; no new threshold added',
            'isolated_core_bounds_alpha_1': core_bounds,
            'isolated_core_entirely_inside': core_bounds['left'] > 0 and core_bounds['top'] > 0
                and core_bounds['left'] + core_bounds['width'] < width and core_bounds['top'] + core_bounds['height'] < height,
            'visible_support_alpha_128': len(visible_support), 'isolated_support_alpha_128': len(isolated_support),
            'occluded_support_pixels_alpha_128': len(occluded),
            'occluded_coordinates': [[i % width, i // width] for i in occluded],
            'core_display_luminance': luminance(visible_support),
            'other_actor_display_luminance': luminance(actor_support - visible_support),
            'color': helper.record(color_path), 'visible_core': helper.record(visible_path),
            'isolated_core': helper.record(isolated_path)})
    finally:
        for obj, mats in originals.items():
            for index, material in enumerate(mats):
                obj.data.materials[index] = material
            obj.hide_render, obj.hide_viewport = visibility[obj]
        pipe.enum_readback(scene.view_settings, 'view_transform', (view[0],))
        pipe.enum_readback(scene.view_settings, 'look', (view[1],))
        scene.view_settings.exposure, scene.view_settings.gamma = view[2:]
        scene.render.resolution_x = before['render']['resolution_x']
        scene.render.resolution_y = before['render']['resolution_y']
        scene.camera = scene.objects[before['active_camera']]
        scene.frame_set(before['scene_frame']['frame'], subframe=before['scene_frame']['subframe'])
        for material in temporary:
            if material.users:
                raise RuntimeError('Temporary portrait material remains attached')
            bpy.data.materials.remove(material)
        helper.exact_proof(before, helper.snapshot(scene, char), output / 'preservation', 'portrait-render-restoration')
    return {'alpha': alpha, 'portrait': helper.record(color_path)}
