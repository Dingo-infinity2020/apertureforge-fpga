# Sources and evidence

Retrieved / inspected 2026-11-03. Web sources below are primary documentation, research papers, or the project's own repository. Derived arithmetic is our planning model, not a quoted hardware benchmark.

## Existing board and source project

- Local repository: `D:/work/KU5P_FX_Accelerator`, inspected clean HEAD `956f84cea5569ef2c2d1910ce82e468f8bc4b6da`, branch `codex/xdma-bounded-retry-2026-11-02`.
- [Hardware summary at that exact commit](https://github.com/Dingo-infinity2020/KU5P_FX_Accelerator/blob/956f84cea5569ef2c2d1910ce82e468f8bc4b6da/docs/hardware.md): FNIC-KU5P Rev1.0, schematic part XCKU5P-1FFVB676I, dual QSFP28 versus one hard CMAC, PCIe capability versus historical test status. Retrieved through the connected GitHub tool. The default main-branch hardware summary is older and still contains TODOs.
- [Existing RFSoC interface summary](https://github.com/Dingo-infinity2020/KU5P_FX_Accelerator/blob/956f84cea5569ef2c2d1910ce82e468f8bc4b6da/docs/rfsoc-interface.md): existing project is complex time-domain I/Q16; new upstream PFB/FFT and I/Q8 assumptions are not yet implemented there.
- Existing extracted vendor text, kept outside this repository: `D:/work/research/KU5P_FX_Accelerator/2026-10-28-lesson05/FNIC-KU5P_SCH_Rev1.0.pdf.txt`, and `FINC-KU5P_FPGA逻辑使用手册.pdf.txt`. Manual chapter 5 (printed page 21, extracted PAGE 25) describes 72-bit MIG with an optional 8-bit ECC allocation and a compatible -075 memory model. Schematic text identifies five MT40A512M16LY-062E positions. This supports a static DDR-interface hypothesis, not installed capacity, programmed speed or measured throughput.
- Source vendor PDFs remain in the user's Downloads directory and are not copied or published. Prior project records schematic SHA256 `a5ffa7e0ed9de002e1375e2c088e008ac4997a2f35d8c4c8188d495822d18b49`; the PDF hash was not recomputed this turn.

## AMD device and interface documentation

- [AMD UltraScale+ FPGA Product Selection Guide, XMP103](https://docs.amd.com/api/khub/documents/Fz8MLna3N2KIo_xWN_Iv3w/content), PDF page 4 (zero-based page 3), Kintex resources: KU5P 1824 DSP, KU11P 2928, KU15P 1968; hard 100G counts 1/2/4. Packaging limits are on the following page. Source of the device comparison, not proof of any board's port rate.
- [AMD Kintex UltraScale+ product table](https://www.amd.com/en/products/adaptive-socs-and-fpgas/fpga/kintex-ultrascale-plus.html): cross-check of LUT, DSP, RAM and transceiver families.
- [AMD Zynq UltraScale+ RFSoC product table](https://www.amd.com/en/products/adaptive-socs-and-fpgas/soc/zynq-ultrascale-plus-rfsoc.html): ZU47DR-class RF-ADC and programmable-logic capabilities. The ADC native resolution is distinct from post-PFB transport quantization.
- [AMD Integrated 100G Ethernet](https://www.amd.com/en/products/adaptive-socs-and-fpgas/intellectual-property/cmac_usplus.html) and [UG583 integrated 100G migration](https://docs.amd.com/r/en-US/ug583-ultrascale-pcb-design/9.-Integrated-100G-Ethernet-Migration): MAC/PCS and GT placement/routing constraints. Physical QSFP count does not establish independent MAC availability.

## Astronomy algorithms and reference observing cadences

- Tegmark & Zaldarriaga (2009), [Fast Fourier transform telescope](https://journals.aps.org/prd/abstract/10.1103/PhysRevD.79.083530), [arXiv version](https://arxiv.org/abs/0805.4414): regular-grid spatial-FFT telescope architecture.
- Tegmark & Zaldarriaga (2010), [Omniscopes](https://arxiv.org/abs/0909.0001): hierarchical-grid extensions. Does not justify an FFT for arbitrary tile-center positions.
- Thyagarajan et al. (2017), [A generic and efficient E-field Parallel Imaging Correlator](https://doi.org/10.1093/mnras/stx113): antenna electric-field gridding, spatial transform and image products.
- [EPIC project's algorithm documentation](https://epic-astronomy.org/docs/theory/epic-algorithm): ordering of per-sample imaging and accumulation, autocorrelation removal, kernels, frequency-dependent grid positions, padding, and coplanar limitations. Science settings must not be copied blindly from a different array.
- Kent et al. (2019), [A Real-Time, All-Sky, High Time Resolution, Direct Imager for the LWA](https://arxiv.org/abs/1904.11422): deployed EPIC reference.
- Ng et al. (2017), [CHIME FRB: An application of FFT beamforming for a radio telescope](https://arxiv.org/abs/1702.04728): 24 kHz, approximately 0.983 ms design reference and chromatic beam alignment. Used to motivate cadence/channel-width scans, not to predict our sensitivity.
- Thyagarajan, Thekkeppattu & Humphrey (2026), [A fast, wide-field, and real-time imaging prototype for large aperture arrays](https://arxiv.org/html/2609.03027v1): recent FPGA EPIC prototype, simulation, resource capacity, and stated per-core bandwidth. Does not constitute an end-to-end measured throughput result for our KU cards.

## Explicit limits of this deliverable

No new Vivado project or hardware session was started. Only the existing Vivado MCP session status was read during the initial planning turn; no session was running. The installed Vivado 2026.1 executable was located, but device/IP license and alternative part availability were not probed. The capacity and transport-budget calculators run locally with Node.js and produce analytical tables. The user subsequently supplied an empty GitHub repository and explicitly requested synchronization: the initial plan was pushed to `main` as `06f7e47`. The repository was created by the user. No GitHub issue or message was sent.

The KU15P four-hard-CMAC count was rechecked against XMP103 on 2026-11-03 after the user's interface question. This is device-level information, not proof of four usable board ports; the default capacity profiles now retain KU5P single-port and hypothetical KU11P/KU15P dual-port configurations only.
