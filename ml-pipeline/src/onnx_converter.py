import pickle
import numpy as np
from pathlib import Path
from skl2onnx import convert_sklearn
from skl2onnx.common.data_types import FloatTensorType
import onnx


class ONNXConverter:

    def __init__(self, model_path: str = 'models/cookie_classifier.pkl'):
        self.model_path = Path(model_path)
        self.model = None

    def load_model(self):
        print(f"Loading model from {self.model_path}...")
        with open(self.model_path, 'rb') as f:
            self.model = pickle.load(f)
        print("Model loaded successfully")

    def convert_to_onnx(self, output_path: str = '../extension/models/cookie-classifier.onnx'):
        print("\nConverting model to ONNX format...")

        initial_type = [('input', FloatTensorType([None, 16]))]

        onnx_model = convert_sklearn(
            self.model,
            initial_types=initial_type,
            target_opset=12
        )

        output_path = Path(output_path)
        output_path.parent.mkdir(parents=True, exist_ok=True)

        onnx.save_model(onnx_model, str(output_path))

        file_size = output_path.stat().st_size / (1024 * 1024)
        print(f"ONNX model saved to {output_path}")
        print(f"Model size: {file_size:.2f} MB")

        return onnx_model

    def verify_onnx_model(self, onnx_path: str):
        print("\nVerifying ONNX model...")

        onnx_model = onnx.load(onnx_path)
        onnx.checker.check_model(onnx_model)

        print("ONNX model is valid")

        print("\nModel inputs:")
        for input in onnx_model.graph.input:
            print(f"  Name: {input.name}")
            print(f"  Type: {input.type}")

        print("\nModel outputs:")
        for output in onnx_model.graph.output:
            print(f"  Name: {output.name}")
            print(f"  Type: {output.type}")

    def test_inference(self, onnx_path: str):
        print("\nTesting inference with sample data...")

        try:
            import onnxruntime as ort

            session = ort.InferenceSession(onnx_path)

            test_input = np.random.rand(1, 16).astype(np.float32)

            input_name = session.get_inputs()[0].name
            outputs = session.run(None, {input_name: test_input})

            print("Inference successful!")
            print(f"Output shape: {outputs[0].shape}")
            print(f"Sample output: {outputs[0][0]}")

        except ImportError:
            print("onnxruntime not installed, skipping inference test")
        except Exception as e:
            print(f"Inference test failed: {e}")


def main():
    converter = ONNXConverter()

    converter.load_model()

    onnx_path = '../extension/models/cookie-classifier.onnx'
    converter.convert_to_onnx(onnx_path)

    converter.verify_onnx_model(onnx_path)

    converter.test_inference(onnx_path)

    print("\nConversion complete!")
    print("The ONNX model is ready for use in the browser extension.")


if __name__ == '__main__':
    main()
