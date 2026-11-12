import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

/// What to tell gate staff when the camera cannot start.
String cameraErrorText(MobileScannerErrorCode code) => switch (code) {
  MobileScannerErrorCode.permissionDenied =>
    'Camera access is blocked. Allow the camera for Pikva in your phone '
        "settings, or type the code.",
  MobileScannerErrorCode.unsupported =>
    'No camera was found on this device. Type the code instead.',
  _ => 'The camera could not start. Type the code instead.',
};

/// Shows a live camera view and reports the first QR code it reads. An
/// interface so tests need no camera.
abstract interface class QrScanner {
  /// [onScan] gets the QR text once. [onError] gets a message for the person
  /// when the camera cannot be used (for example permission denied).
  Widget build(
    BuildContext context, {
    required ValueChanged<String> onScan,
    required ValueChanged<String> onError,
  });
}

class MobileQrScanner implements QrScanner {
  const MobileQrScanner();

  @override
  Widget build(
    BuildContext context, {
    required ValueChanged<String> onScan,
    required ValueChanged<String> onError,
  }) => _CameraView(onScan: onScan, onError: onError);
}

class _CameraView extends StatefulWidget {
  const _CameraView({required this.onScan, required this.onError});

  final ValueChanged<String> onScan;
  final ValueChanged<String> onError;

  @override
  State<_CameraView> createState() => _CameraViewState();
}

class _CameraViewState extends State<_CameraView> {
  final _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );

  // The camera can report the same code a few times before it stops.
  bool _done = false;
  bool _errored = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _detected(BarcodeCapture capture) {
    if (_done) return;
    for (final barcode in capture.barcodes) {
      final text = barcode.rawValue;
      if (text != null && text.isNotEmpty) {
        _done = true;
        widget.onScan(text);
        return;
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      fit: StackFit.expand,
      children: [
        MobileScanner(
          controller: _controller,
          onDetect: _detected,
          errorBuilder: (context, error) {
            if (!_errored) {
              _errored = true;
              // Tell the screen after this frame, not while building.
              WidgetsBinding.instance.addPostFrameCallback((_) {
                if (mounted) widget.onError(cameraErrorText(error.errorCode));
              });
            }
            return const SizedBox.shrink();
          },
        ),
        // A square to aim at.
        Center(
          child: FractionallySizedBox(
            widthFactor: 0.7,
            child: AspectRatio(
              aspectRatio: 1,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  border: Border.all(color: Colors.white, width: 3),
                  borderRadius: BorderRadius.circular(16),
                ),
              ),
            ),
          ),
        ),
        Positioned(
          right: 8,
          top: 8,
          child: IconButton.filledTonal(
            tooltip: 'Torch',
            icon: const Icon(Icons.flashlight_on_outlined),
            onPressed: _controller.toggleTorch,
          ),
        ),
      ],
    );
  }
}
