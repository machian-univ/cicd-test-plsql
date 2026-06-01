function readScalarFromTensor(data: ArrayLike<number>): number | null {
  for (let i = 0; i < data.length; i++) {
    const value = data[i];
    if (Number.isFinite(value)) {
      return value;
    }
  }
  return null;
}

export async function runModelInference(
  modelPath: string,
  inputValues: Float32Array,
  inputShape: [number, number],
): Promise<number | null> {
  let ort: typeof import('onnxruntime-node');
  try {
    ort = await import('onnxruntime-node');
  } catch {
    return null;
  }

  ort.env.logLevel = 'error';

  try {
    const session = await ort.InferenceSession.create(modelPath, {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    });

    const inputTensor = new ort.Tensor('float32', inputValues, inputShape);
    const inputName = session.inputNames[0];
    const results = await session.run({ [inputName]: inputTensor });
    const outputTensor = results[session.outputNames[0]];

    if (!outputTensor) {
      return null;
    }

    return readScalarFromTensor(outputTensor.data as Float32Array);
  } catch {
    return null;
  }
}
