# Quick Start Guide

## 🚀 Get Started in 3 Steps

### 1. Environment Setup
Your ClickUp API key is already configured in `config.env`. The repository is ready to use!

### 2. IDE Configuration
Configure your IDE (Cursor, VS Code, etc.) to use the ClickUp MCP server:

**For Cursor:**
- Open Settings
- Search for "MCP"
- Add the ClickUp MCP server configuration from `setup/mcp_config.json`

**For VS Code:**
- Install the MCP extension
- Configure the ClickUp server using the provided config

### 3. Start Using AI Agents
Open your IDE and start using natural language commands:

```
"Show me all my tasks due this week"
```

```
"Create a new task called 'Review pull request #123' in the 'Code Review' list"
```

```
"Move all tasks with status 'In Progress' to 'Review'"
```

## 🎯 Common Commands

### Task Management
- `"Create a task called [name] in [list]"`
- `"Show me all tasks with [tag]"`
- `"Move task [name] to [list]"`
- `"Update priority of [task] to [high/medium/low]"`

### CRM Tasks
- `"Create a CRM task called [name]"`
- `"Show me all CRM tasks"`
- `"Move [task] to CRM list"`
- **Note**: CRM automatically refers to list ID `901106214760`

### Time Tracking
- `"Start tracking time on [task]"`
- `"Stop time tracking"`
- `"Add 2 hours to [task] for yesterday"`

### Bulk Operations
- `"Create tasks for [project]: [task1], [task2], [task3]"`
- `"Move all tasks with status [status] to [new-status]"`

## 🔧 Troubleshooting

**Issue**: MCP server not found
**Solution**: Ensure you have Node.js installed and run `npm install`

**Issue**: Authentication error
**Solution**: Verify your API key in `config.env` is correct

**Issue**: Can't find tasks/lists
**Solution**: Use the workspace hierarchy tool to explore your ClickUp structure

## 📚 Next Steps

1. Read `AGENT_INSTRUCTIONS.md` for detailed usage guidelines
2. Explore your ClickUp workspace structure
3. Try creating and managing tasks
4. Set up your preferred workflows

---

**Need help?** Check the main `README.md` for comprehensive documentation.
