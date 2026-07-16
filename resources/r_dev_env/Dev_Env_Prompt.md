# Development Environment Conventions

These instructions govern the development workflow and rules for the AI agent and the user.

## 1. Directory Structure

Before beginning any development work, ensure the project directory is configured with the standard conventions. The exact folders may vary by project, but expect foundational folders such as:

```text
.
├── app/
├── changelogs/
├── resources/
│   ├── prompts/
│   ├── recommendations/
│   └── research/
└── README.md
```

## 2. README.md Guidelines

The `README.md` file serves as the primary documentation for the application.

### Structure
1. **Title/Name of the App** `**`
2. **Description of the App** `**`
3. **How to Use It**
   - 3.1 Prerequisites
   - 3.2 Setup and Configuration
   - 3.3 Running the Application
   - 3.4 Common Issues and Troubleshooting
4. **Future Implementations** (if discussed)

**Pre-requisite check:** Before creating or updating the `README.md`, ensure that the items marked with `**` (Title and Description) have already been defined. Scan all available `.md` files in the directory to find this information.

## 3. Configuration Centralization (`.env`)

All tweakable parameters, file paths, thresholds, and environment-specific settings must be stored in a root `.env` file using the `python-dotenv` package (or equivalent for the target language). 
- Do not hardcode configurations in the application's source code. 
- Always maintain an up-to-date `.env.example` file so the configuration schema can be safely committed to version control.

## 4. Virtual Environments

Ensure all Python scripts are executed using the project's primary virtual environment. Avoid fragmenting environments across sub-directories unless strictly necessary. If a `venv/` folder exists in the project root, assume it is the canonical environment (e.g., `venv/bin/python`).

## 5. Changelogs (`changelogs/` and `CHANGELOG.md`)

All changes must be documented systematically in both the `changelogs/` directory and the root `CHANGELOG.md` file.

- **Detailed Changelogs (`changelogs/`):**
  - **Naming Convention:** `yyyy-mm-dd-hh-mm-<change_type>.md`
  - **Acceptable `<change_type>` tags:** Use standard tags such as `feat`, `fix`, `refactor`, `docs`, or `chore`. (e.g., `2024-05-20-14-30-feat.md`)
  - **Content Format:** Each detailed changelog must comprehensively detail the following for every altered item:
    1. **What was updated?** (Description of the change)
    2. **Why was it updated?** (Reason or context for the change)
    3. **How was it updated?** (Technical implementation details)

- **Summarized Changelog (`CHANGELOG.md`):**
  - **Location:** The project root directory.
  - **Content Format:** Serves as a high-level timeline showing brief summaries of changes, grouped by date. Each entry must include a clickable link (using the absolute `file://` scheme) to the corresponding detailed changelog in the `changelogs/` directory.


## 6. Resources (`resources/`)

### 6.1 Recommendations (`resources/recommendations/`)

Store any proactive architectural or development recommendations here.
- **Naming Convention:** `yyyy-mm-dd-<recommendation_type>.md`
- **Content Guidelines:** If the user asks for a recommendation, draft it here. Detail the recommendation and include any links or resources used during your research.

### 6.2 Vision & Multi-Day Prompts (`resources/prompts/`)

This directory holds overarching project context, massive multi-day feature requirements, or architectural visions.
- **Workflow:** 
  1. For standard daily tasks, the user will communicate directly via the chat interface using `@file` mentions.
  2. For massive overhauls, read the provided `.md` prompt file here to grasp the overarching vision.
  3. If details are missing or ambiguous, **ask questions before executing** to prevent miscommunication.
  4. Once the massive feature is completely fulfilled, execute a command to rename the prompt file to `yyyy-mm-dd-hh-mm-<prompt_name>_complete.md` to mark the entire vision as implemented.

### 6.3 Research (`resources/research/`)

Store contextual research and references done by either the user or the agent here.
- **Workflow:** Before applying any concepts from these research files, verify with the user if they are applicable to the current implementation. These serve as reference points for building the system.

## 7. Planning & Task Tracking

When addressing a new prompt or complex feature, do not create local `.md` files to track tasks. 
- **Workflow:** Rely on the AI Agent's built-in `implementation_plan.md` and `task.md` Artifacts. Generate the implementation plan for the user to review and approve via the interface. Track progress using the artifact checklists.
- **Walkthroughs & Changelogs:** Generate a `walkthrough.md` Artifact upon completing complex tasks to summarize your work. Ensure the detailed contents of this walkthrough are included in a newly created changelog file (`changelogs/`) so that a detailed review can be done and a permanent record of the changes is maintained.