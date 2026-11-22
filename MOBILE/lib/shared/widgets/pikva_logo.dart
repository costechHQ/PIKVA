import 'package:flutter/material.dart';

/// The Pikva logo, copied from FRONTEND/public/images/pikva-logo.png.
class PikvaLogo extends StatelessWidget {
  const PikvaLogo({super.key, this.height = 64});

  final double height;

  @override
  Widget build(BuildContext context) {
    return Image.asset(
      'assets/images/pikva-logo.png',
      height: height,
      fit: BoxFit.contain,
      semanticLabel: 'Pikva',
    );
  }
}
