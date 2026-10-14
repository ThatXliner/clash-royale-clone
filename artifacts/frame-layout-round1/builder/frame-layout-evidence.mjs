const EPSILON = 0.00001;

export function parseFrameScale(layout) {
  const numeric = "([-+]?(?:\\d+\\.?\\d*|\\.\\d+)(?:e[-+]?\\d+)?)";
  const inline = layout?.iframe?.inline?.transform?.match(
    new RegExp(`^scale\\(\\s*${numeric}\\s*\\)$`, "iu"),
  );
  const matrix = layout?.iframe?.transform?.match(
    new RegExp(`^matrix\\(\\s*${numeric}\\s*,\\s*${numeric}\\s*,\\s*${numeric}\\s*,\\s*${numeric}\\s*,\\s*${numeric}\\s*,\\s*${numeric}\\s*\\)$`, "iu"),
  );
  const rect = layout?.iframe?.rect;
  const rectScale = rect === undefined ? null : [rect.width / 720, rect.height / 1_280];
  const computedScale = matrix === null || matrix === undefined ? null : [
    Math.hypot(Number(matrix[1]), Number(matrix[2])),
    Math.hypot(Number(matrix[3]), Number(matrix[4])),
  ];
  const inlineScale = inline === null || inline === undefined ? null : Number(inline[1]);
  const values = [inlineScale, ...(computedScale ?? []), ...(rectScale ?? [])];
  const allPositiveFinite = values.length === 5 &&
    values.every((value) => Number.isFinite(value) && value > 0);
  const uniformSources = computedScale !== null && rectScale !== null &&
    Math.abs(computedScale[0] - computedScale[1]) <= EPSILON &&
    Math.abs(rectScale[0] - rectScale[1]) <= EPSILON;
  const agree = allPositiveFinite && values.every((value) =>
    Math.abs(value - values[0]) <= EPSILON);
  const valid = inlineScale !== null && computedScale !== null && rectScale !== null &&
    allPositiveFinite && uniformSources && agree;
  return {
    valid,
    value: valid ? values[0] : null,
    sources: { inline: inlineScale, computed: computedScale, rect: rectScale },
    reason: valid ? null : "inline, computed, and rect-derived scales must be positive and agree",
  };
}
