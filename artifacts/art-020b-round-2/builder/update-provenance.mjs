import { readFile, writeFile } from 'node:fs/promises';

const provenancePath = 'docs/art/rivet-runners-battle-sprite-provenance.json';
const provenance = JSON.parse(await readFile(provenancePath, 'utf8'));
const portrait = {
  path: 'demo/assets/rivet-runners-portrait.png',
  sha256: 'b84c733e475b50d746d955ec805d0c5da1e998ca4e2fc9f76305f661ce942de0',
  dimensions: { width: 1254, height: 1254 },
  bytes: 2819557,
  alpha_channel: false,
};
const v2 = {
  path: 'demo/assets/rivet-runners-battle-sprite-v2.png',
  sha256: '8fe8439376ab117cb88dac92c5eb9a32a9ee564c3f72a3ab3dccfe9aa22f8b65',
  dimensions: { width: 1254, height: 1254 },
  bytes: 2220668,
  alpha_channel: true,
  alpha_extrema_8bit: [0, 255],
  alpha_extrema_normalized: [0, 1],
  role: 'second generated cutout and round-two edit target; preserved byte-identically as revision history',
  actual_tool_input_path: 'demo/assets/rivet-runners-battle-sprite-v2.png',
};
const v3Prompt = `Use case: stylized-concept. Asset type: isolated transparent full-body battle sprite for an original fantasy card battler.

Image 1 is the approved original Rivet Runners portrait. Use only the LEFT adult otter as identity reference: warm brown river-otter fur, rounded ears, large warm dark eyes, and a broad cream muzzle. Do not include the second otter or workshop. Image 2 is the latest single-otter battle cutout and provides continuity for the same character, vest, mallet and painterly finish. Redesign the proportions and shapes for clear readability at exactly 13 by 13 CSS pixels.

Create exactly one adult anthropomorphic brown river otter courier in a compact upright three-quarter battle pose facing toward the upper arena. Make the head and face oversized, about 45% of subject height. The broad cream muzzle must be a large light-cream shape clearly separated from brown cheek fur by a dark brown edge, with a simple dark nose. Keep exactly two tiny short feet at the bottom, separated from the torso and from each other by broad transparent gaps that remain open when reduced to 13px. No third foot; tail tiny and tucked.

Give the otter a large, solid, bright saturated teal-green work vest covering chest and belly as one broad unbroken block. Vest must be clearly distinct from brown fur even at 13px; use a clean dark outline and almost no shading or texture. Keep two simple copper fasteners at most. Compact torso, minimal arm overlap.

Hold one compact hand mallet on the viewer's right, separate from the torso by a broad transparent gap that remains visibly open at 13px. It must read unmistakably as a melee mallet, never a cannon or firearm: broad simple orange-copper capped head with one large readable copper end face, dark rootwood body, and a thick short wooden handle visibly attached to the mallet head. Handle must not be a thin shaft. Mallet must remain distinct from the vest and arm. No other tool.

Prioritize five broad color shapes at native 13px: brown head, cream muzzle, bright teal vest, orange-copper mallet, and two feet. Use bold readable contours, strong dark separation, broad painterly color masses, very little internal shading, and almost no fine detail. Keep a lively friendly expression; preserve the approved otter's identity. Keep entire figure, ears, hands, feet and mallet inside a square canvas with small transparent padding and no clipping.

Polished cohesive painterly fantasy game art simplified into a clean readable sprite. Genuine transparent alpha around the figure. No background, floor, shadow, glow, halo, opaque placeholder, checkerboard, armor, straps, toolkit, tiny gears, clutter, extra characters, labels, logos, watermark, frame, or copied real-game characters/assets/names.`;

provenance.input_images = provenance.input_images.filter((image) => image.path !== v2.path);
provenance.input_images.push(v2);
provenance.generations = provenance.generations.filter((generation) => generation.attempt < 3);
provenance.superseded_shipped_outputs = [];
provenance.generations[1].generated_source.path = v2.path;
provenance.generations[1].generated_source.retained_source_copy_path = v2.path;
provenance.generations.push(
  {
    attempt: 3,
    status: 'discarded; final output-wrapper did not surface the generated image, so it was not considered for adoption',
    generated_source: {
      tool_output_path: '/Users/me/.codex/generated_images/01a137f7-1e7c-7bc0-9ee5-255c4869fd0b/exec-a9d127c5-b8bd-4eb8-be44-f64557644971.png',
      sha256: '1773da08a5def57adef8664b3b29e513e8890b0018e4656262a60217617e3a46',
      dimensions: { width: 1254, height: 1254 },
      bytes: 1773189,
      alpha_channel: true,
      alpha_extrema_8bit: [0, 255],
      alpha_extrema_normalized: [0, 1],
      alpha_mean_normalized: 0.510902,
      format: 'PNG',
      repository_source_copy: false,
    },
    input_images: [
      { ...portrait, role: 'approved portrait identity reference; only the left otter' },
      { ...v2, role: 'latest battle-cutout continuity reference', actual_tool_input_path: v2.path },
    ],
    prompt: `Use case: stylized-concept
Asset type: transparent full-body battle cutout for an original fantasy card battler
Input images: Image 1 is the approved Rivet Runners portrait; use only the left otter as the character identity reference.
Primary request: transform that one adult river-otter courier into one original battle-ready cutout, retaining the same brown fur, light cream muzzle and cheeks, round dark ears, alert warm eyes, practical solid teal work vest with broad copper fasteners, and rootwood mallet identity.
Subject: exactly one adult brown river otter with a light muzzle, short limbs, two visible feet, and one large rootwood mallet with simple copper end caps. Keep the face/head about 45% of the full subject height, the teal vest as one strong uninterrupted body mass, and the mallet clearly recognizable as a heavy melee tool, never a cannon. Hold the mallet at the outside of the body, separated from the vest and arm by a clean narrow dark gap.
Style/medium: polished painterly fantasy game art, tactile brown fur and carved rootwood with broad simplified shapes, clean strong silhouette, crisp face and vest color blocks; retain the portrait's visual identity while simplifying details for a tiny arena unit.
Composition/framing: single full-body character in a square transparent canvas, compact short-limbed chibi proportions, three-quarter battle pose facing toward the upper arena with the face visible, both feet planted and visible. Keep the entire ears, feet, arms, mallet, and head inside the canvas with small even padding; no edge clipping.
Lighting/mood: soft warm highlights matching the portrait, alert and ready to rush into close combat.
Color palette: warm brown fur, light cream muzzle, solid moss-teal vest, restrained copper accents, natural rootwood.
Text (verbatim): none.
Constraints: preserve the approved left otter's identity while removing the second otter and the entire workshop background. Output a real transparent cutout with clean alpha, no floor, no cast shadow, no glow, no halo, and no background. Keep the face, vest, mallet, feet, and outer silhouette distinct at 13px CSS size. No tiny gears, toolkits, straps, clutter, labels, logos, watermark, frame, checkerboard, or copied game assets/names.`,
    revision_reason: 'superseded by a focused shape-separation edit after the round-one blind critique',
  },
  {
    attempt: 4,
    status: 'discarded; prompt-generation API result inspection only, not considered for adoption',
    generated_source: {
      tool_output_path: '/Users/me/.codex/generated_images/01a137f7-1e7c-7bc0-9ee5-255c4869fd0b/exec-02f73ac1-5a92-4c40-823a-c4fc2c525552.png',
      sha256: 'bd9b3fcfde0f565bb2552f73ad2ac4ebf54072e2409d6768a649a210d9bd1dc6',
      dimensions: { width: 1254, height: 1254 },
      bytes: 1932676,
      alpha_channel: true,
      alpha_extrema_8bit: [0, 255],
      alpha_extrema_normalized: [0, 1],
      alpha_mean_normalized: 0.510756,
      format: 'PNG',
      repository_source_copy: false,
    },
    input_images: [
      { ...portrait, role: 'approved portrait identity reference; only the left otter' },
      { ...v2, role: 'latest battle-cutout continuity reference', actual_tool_input_path: v2.path },
    ],
    prompt: 'Edit the referenced image into one original full-body adult brown river-otter battle sprite. Retain the approved left otter identity, brown fur, large head, dark eyes, and broad cream muzzle. Give the otter a compact body, an oversized face with cream muzzle sharply separated from brown cheeks, a large bright saturated teal-green vest as one clean unbroken color block, and exactly two tiny short feet separated by a broad visible transparent gap. On viewer\'s right, hold one compact rootwood hand mallet: broad orange-copper capped head and thick short wooden handle, clearly separated from body by a wide transparent gap. Make every part distinct at exact 13px CSS size using bold simple painterly shapes, strong dark outlines and minimal detail. Keep one complete centered figure, small clear padding, full ears/mallet/feet inside. Genuine transparent background. No shadow, glow, checkerboard, additional subjects, armor, gear clutter, text, logos, or copied game assets. Image 1 is approved portrait identity; use only its left otter. Image 2 is continuity reference.',
    revision_reason: 'discarded pending inspection of the returned image metadata; the next explicit edit superseded it',
  },
  {
    attempt: 5,
    status: 'adopted as round-two V3 full-resolution source',
    generated_source: {
      path: 'demo/assets/rivet-runners-battle-sprite.png',
      sha256: '1eb0f74862d3ec768e1fcfac727d20be8d7fd0fa2c5b88e93207ae296349663e',
      dimensions: { width: 1254, height: 1254 },
      bytes: 1890785,
      alpha_channel: true,
      alpha_extrema_8bit: [0, 255],
      alpha_extrema_normalized: [0, 1],
      alpha_mean_normalized: 0.524744,
      tool_output_path: '/Users/me/.codex/generated_images/01a137f7-1e7c-7bc0-9ee5-255c4869fd0b/exec-b9059714-4a4d-404a-8b3c-372e23599a5f.png',
      format: 'PNG',
    },
    input_images: [
      { ...portrait, role: 'approved portrait identity reference; only the left otter', actual_tool_input_path: portrait.path },
      { ...v2, role: 'V2 battle cutout edit target and continuity reference', actual_tool_input_path: v2.path },
    ],
    prompt: v3Prompt,
    revision_reason: 'round-one blind critique found that the vest and feet merged into the body and the mallet cap and handle lost their separation at 13px; this edit made the vest brighter and flatter, enlarged the cream muzzle, and specified broad gaps around the feet and mallet',
  },
);

provenance.superseded_shipped_outputs = [
  {
    path: 'public/assets/rivet-runners-battle-sprite.webp',
    sha256: '1813f2570ddf88dc72144ea2b49a24d818e639054c23145aed2a368d619925b4',
    dimensions: { width: 512, height: 512 },
    bytes: 94112,
    alpha_channel: true,
    alpha_extrema_8bit: [0, 253],
    alpha_extrema_normalized: [0, 0.992157],
    alpha_mean_normalized: 0.526405,
    format: 'WebP',
    encoding: {
      tool: 'cwebp',
      version: '1.6.0',
      arguments: ['-quiet', '-q', '88', '-m', '6', '-metadata', 'none', '-resize', '512', '512'],
      color_encoding: 'lossy WebP at quality 88',
      alpha_encoding: 'lossless WebP alpha',
    },
    status: 'superseded by the round-two output; this failed round-one asset is retained in candidate history only',
  },
];
provenance.shipped_output = {
  path: 'public/assets/rivet-runners-battle-sprite.webp',
  sha256: '0a9d033f894bd19178871a2927117cf66bb7f42c0b65dc224e11cecca0b4ce53',
  dimensions: { width: 512, height: 512 },
  bytes: 78170,
  alpha_channel: true,
  alpha_extrema_8bit: [0, 254],
  alpha_extrema_normalized: [0, 0.996078],
  alpha_mean_normalized: 0.52475,
  format: 'WebP',
  encoding: {
    tool: 'cwebp',
    version: '1.6.0',
    arguments: ['-quiet', '-q', '88', '-m', '6', '-metadata', 'none', '-resize', '512', '512'],
    color_encoding: 'lossy WebP at quality 88',
    alpha_encoding: 'lossless WebP alpha',
  },
};
await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`);
