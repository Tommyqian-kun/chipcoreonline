# ChipCore
**Production-proven in real 7nm/5nm mobile SoC programs.** Open-source EDA infrastructure for SDC/UPF — intent-driven, not vendor rule-based.

ChipCore is an online EDA tool service platform for chip back-end implementation engineers. It focuses on practical data generation, data checking, and flow collaboration problems in real SOC implementation work. This is not a generic demo application; it is built around real engineering needs such as efficient SDC/UPF generation and checking, CLK circuit data generation, and future CTS spec data generation.

The current development and testing focus is **ECS Only deployment + multi-page interactive tools**. Users upload design inputs in the browser, edit data through visual tables or canvases, submit tasks, and then retrieve generated results from the download page after asynchronous execution through Redis, Worker processes, and Docker containers.

## Production-Proven Mobile SoC Applications

ChipCore is positioned as EDA infrastructure inside the SoC implementation flow, not as a standalone demo framework. The SDC/UPF data generation tools in this project were previously used in real 7nm/5nm mobile SoC programs.

Those chips included complex IPs such as baseband, NPU, CPU, GPU, DDR, and MIPI. During implementation, all blocks, subsystems, and top-only scenarios across the full chip used the SDC generation capability from this project. Both the 7nm and 5nm chips reached mass production successfully.

The tools being developed in this repository are an evolved version of what was used in those shipped chip programs. More capabilities will be shared progressively based on development milestones.

## Project Focus

- SDC constraint data generation and checking through a multi-page Excel-like web editing workflow.
- UPF power intent data generation and checking through the same multi-page task workflow.
- CLK/cmsgen circuit data generation as an independent visual-canvas tool integrated with the shared platform execution foundation.
- Future tool expansion, including CTS spec data generation and more chip back-end implementation data utilities.

These tools target real data problems in chip back-end development and complement traditional EDA vendor tools.

## Current Status

| Module | Status |
| --- | --- |
| SDC Generator | Implemented as an ECS Only multi-page workflow |
| UPF Generator | Implemented as an ECS Only multi-page workflow |
| CLK/cmsgen | Platform integration design is documented and follows an independent tool architecture |
| Task execution | Redis queue + Python Worker + Docker container |
| Current development mode | ECS Only local file storage |
| Not the current focus | ECS+OSS+ACR deployment and single-page tool mode |

## Development Roadmap

- SDC/UPF agent automation: based on the existing multi-page workflow and validation system, we will further add AI agent-driven automated data generation to improve efficiency and consistency for complex constraint and power-intent data.
- CMSGEN agent automation: the CMSGEN tool (automated CLK circuit generation) has already been developed, and it will progressively adopt agent-driven automated generation on top of the shared platform foundation.
- MERGED SDC project: for large and complex SoCs that face hundreds of corner/scenarios/views combinations at signoff stage, the MERGED SDC approach is designed to significantly reduce signoff corner/scenarios/views volume and support timing ECO convergence with higher efficiency and precision.

## Architecture Overview

```text
React Web UI
  -> Express API authentication/quota/task creation
  -> PostgreSQL persistence for tasks, tools, and users
  -> Redis task_queue enqueue
  -> Python Worker task pickup
  -> Docker tool container execution
  -> jobs/{taskId}/output result package
  -> Download page result retrieval
```

The platform separates two types of logic:

- Tool business logic: SDC, UPF, and cmsgen keep independent input formats, validation rules, and execution behavior.
- Shared platform capabilities: authentication, subscriptions, TaskId, queues, Worker execution, Docker execution, downloads, logs, cleanup, and admin management reuse the same foundation.

## Tech Stack

- Frontend: React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui
- Backend: Node.js, Express, TypeScript
- Database: PostgreSQL, Prisma
- Queue/cache: Redis
- Tool execution: Python, Docker
- Current storage mode: ECS local filesystem

## Repository Layout

```text
ChipCore/
├── app/
│   ├── frontend/          # React frontend
│   └── backend/           # Express API, Prisma, Worker entrypoints
├── build_images/          # Tool Docker image build files
├── templates/             # Tool input templates
├── docs/                  # Architecture, execution flow, and integration notes
├── tests/                 # Unit, integration, and e2e tests
├── jobs/                  # ECS Only task runtime directory
├── temp/                  # Temporary upload directory
└── logs/                  # Runtime logs
```

## Quick Start

Requirements:

- Node.js >= 22.19
- npm >= 10.9
- Python 3.11+
- Docker
- PostgreSQL and Redis, or the Docker Compose services provided by this repository

Install dependencies:

```bash
npm run install:all
python3.11 -m pip install -r requirements.txt
```

Start PostgreSQL and Redis:

```bash
npm run docker:up
```

Configure backend environment variables. At minimum:

```env
DATABASE_URL="postgresql://postgres:postgres123@localhost:5432/chipcore_dev"
REDIS_URL="redis://localhost:6379"
DEPLOYMENT_MODE="ecs_only"
JWT_SECRET="your-secret-key"
PORT=8080
FRONTEND_PORT=3000
```

Initialize the database:

```bash
cd app
npm run db:generate
npm run db:push
npm run db:seed
```

Start the frontend and backend API:

```bash
npm run dev
```

Start the Worker in another terminal:

```bash
npm run dev:worker
```

Open:

- Frontend: http://localhost:3000
- Backend health check: http://localhost:8080/health

## Tool Images

Real SDC and UPF task execution depends on local Docker images. The current database seed and Worker use these image names:

- `ChipCore/sdc-generator:latest`
- `ChipCore/upf-generator:latest`

Use the existing build scripts to generate local images and tar packages:

```bash
bash build_images/sdcgen/build_sdc_image_ecsonly_win.sh v1.0.0 multi
bash build_images/upfgen/build_upf_image_ecsonly_win.sh v1.0.0 multi
```

For manual builds, the Docker build context must be the project root:

```bash
docker build -f build_images/sdcgen/docker_sdc_generator_ecsonly_win_Dockerfile -t ChipCore/sdc-generator:latest .
docker build -f build_images/upfgen/docker_upf_generator_ecsonly_win_Dockerfile -t ChipCore/upf-generator:latest .
```

## Useful Commands

```bash
npm run dev              # frontend + backend API
npm run dev:frontend     # frontend only
npm run dev:backend      # backend only
npm run dev:worker       # start task Worker
npm run build            # build frontend and backend
npm run docker:up        # start PostgreSQL + Redis
npm run docker:down      # stop PostgreSQL + Redis
npm run test             # unit tests
npm run test:e2e         # Playwright e2e tests
```

## Key Documents

- [ECS Only multi-page architecture](docs/ecsonly_multipage_dev_opus45_0.md)
- [Tool execution flow](docs/tool_step_details.md)
- [TaskId uniqueness mechanism](docs/unique_taskid_mechanism.md)
- [Task rework mechanism](docs/task_rework_mechanism.md)
- [cmsgen integration details](docs/cmsgen_full_intg_details.md)
- [cmsgen database integration notes](docs/cmsgen_db_intg.md)
- [SDC local test reference](docs/sdc_local_test_ecsonly_win.md)
- [UPF local test reference](docs/upf_local_test_ecsonly_win.md)

## Development Conventions

- Current feature development and testing should prioritize ECS Only multi-page workflows.
- SDC, UPF, and cmsgen are different tools; keep their business logic independent.
- TaskId, Redis queueing, Worker execution, Docker execution, downloads, authentication, subscriptions, and admin management should reuse shared platform capabilities.
- Do not simplify real tool business rules just to make technical integration easier.
- Real task execution testing requires the API, frontend, and Worker to run together.

## License

MIT
