---
name: Bug report
about: Report a defect in ChipCore SDC/UPF tools or platform
title: "[Bug] "
labels: bug
assignees: ''
---

## Summary

<!-- One or two sentences describing the bug. -->

## Affected tool

<!-- Check one. -->

- [ ] SDC Generator
- [ ] UPF Generator
- [ ] Platform / task execution
- [ ] Other (describe)

## Reproduction steps

1.
2.
3.

## Expected behavior

<!-- What should happen. -->

## Actual behavior

<!-- What actually happens. Include error messages verbatim. -->

## Environment

- **ChipCore version**: (e.g. v0.1.0, or commit SHA)
- **Deployment mode**: ECS Only / ECS+OSS+ACR / single-page
- **OS**: (e.g. Ubuntu 22.04, Windows 11)
- **Node.js version**: (run `node -v`)
- **Python version**: (run `python3 --version`)
- **Docker version**: (run `docker --version`)

## Input data

<!-- If the bug involves SDC or UPF data, attach or paste a minimal example. -->

- **SDC constraints** (paste or attach):
  ```tcl
  <!-- paste here -->
  ```
- **UPF power intent** (paste or attach):
  ```upf
  <!-- paste here -->
  ```
- **Other inputs**:

## Tool image

<!-- Which Docker image is in use? -->

- [ ] `ChipCore/sdc-generator:latest`
- [ ] `ChipCore/upf-generator:latest`
- [ ] Built locally from source

## Logs

<!-- Paste relevant logs from `logs/` directory. -->

```

```
