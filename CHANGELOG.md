# Changelog

All notable changes to ChipCore will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-07

### Added
- Initial open-source release of the ChipCore platform.
- **SDC Generator** — multi-page Excel-like workflow for SDC constraint data generation and checking across block, subsystem, and top-level scenarios.
- **UPF Generator** — multi-page workflow for UPF power-intent data generation and checking, sharing the platform execution foundation.
- **Platform execution foundation** — Redis task queue, Python Worker, Docker-based tool containers, ECS-only local file storage.
- **Shared platform capabilities** — authentication, subscription, TaskId uniqueness, queueing, downloads, logs, cleanup, admin.
- **Tool Docker images** — `ChipCore/sdc-generator:latest` and `ChipCore/upf-generator:latest`, with build scripts for both Linux and Windows.
- **Comprehensive docs** — ECS-only multi-page architecture, tool execution flow, TaskId uniqueness mechanism, task rework mechanism, cmsgen integration notes, local test references for SDC and UPF.
- **Test setup** — unit tests, integration tests, and Playwright e2e test scaffold.
- **Bug report issue template** — with SDC/UPF-specific reproduction fields.
- **MIT License**.

### Notes
- ChipCore is the open-source evolution of a toolchain previously used in real 7nm/5nm mobile SoC programs that reached mass production, covering baseband, NPU, CPU, GPU, DDR, and MIPI IP.
- Roadmap: SDC/UPF agent automation, CMSGEN agent automation, MERGED SDC project, and additional back-end utilities.
