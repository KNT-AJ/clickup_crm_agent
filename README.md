# ClickUp MCP Agent Repository

This repository is configured for using AI agents (like Claude in Cursor) to interact with ClickUp through the Model Context Protocol (MCP).

## 🚀 Quick Start

1. **Clone this repository**
2. **Install dependencies** (if needed for your setup)
3. **Configure your IDE** to use the ClickUp MCP server
4. **Start using AI agents** to manage your ClickUp workspace

## 📋 Prerequisites

- [Cursor](https://cursor.sh/) or another IDE that supports MCP
- ClickUp account with API access
- Node.js (if running local MCP server)

## 🔧 Configuration

### API Key Setup
Your ClickUp API key is securely stored in `config.env`. This file is gitignored to prevent accidental commits.

### MCP Server Configuration
The repository includes configuration for connecting to the ClickUp MCP server:

- **Host**: localhost (default)
- **Port**: 3000 (default)
- **API Key**: Automatically loaded from config.env

## 🤖 Using AI Agents

### Example Agent Instructions

When working with AI agents in Cursor, you can use prompts like:

```
"Create a new task in my 'Development' list with the title 'Fix login bug' and assign it to me"
```

```
"Show me all tasks with the 'urgent' tag that are due this week"
```

```
"Move the task 'Update documentation' from 'To Do' to 'In Progress'"
```

### Available Operations

The ClickUp MCP provides access to:

- **Task Management**: Create, update, move, delete tasks
- **List Operations**: Create lists, manage folders
- **Time Tracking**: Start/stop timers, add time entries
- **Comments**: Add comments to tasks
- **File Attachments**: Attach files to tasks
- **Bulk Operations**: Handle multiple tasks efficiently
- **Workspace Queries**: Search across entire workspace

## 📁 Repository Structure

```
clickup_mcp_agent/
├── config.env          # API configuration (gitignored)
├── .gitignore          # Prevents sensitive files from being committed
├── README.md           # This file
└── setup/              # Additional setup files (if needed)
```

## 🔒 Security

- API keys are stored in `config.env` which is excluded from version control
- Never commit sensitive credentials to the repository
- Use environment variables for all configuration

## 🛠️ Troubleshooting

### Common Issues

1. **MCP Server Not Found**: Ensure the ClickUp MCP server is running
2. **Authentication Errors**: Verify your API key is correct in `config.env`
3. **Permission Issues**: Check that your ClickUp account has the necessary permissions

### Getting Help

- Check the [ClickUp API Documentation](https://clickup.com/api)
- Review MCP server logs for detailed error messages
- Ensure your IDE is properly configured for MCP integration

## 📝 Usage Examples

### Creating Tasks
```
"Create a task called 'Review pull request #123' in the 'Code Review' list with high priority"
```

### Managing Workflows
```
"Move all tasks with status 'In Progress' to 'Review' status"
```

### Time Tracking
```
"Start tracking time on the task 'Implement user authentication'"
```

### Bulk Operations
```
"Create 5 tasks for the sprint planning meeting: 'Sprint Planning', 'Backlog Grooming', 'Story Pointing', 'Sprint Goal Setting', 'Team Retrospective'"
```

## 🔄 Updates

This repository is designed to be a living workspace. As you use it:

- Update this README with new workflows you discover
- Add custom scripts or configurations as needed
- Share successful agent prompts with your team

---

**Note**: This repository is configured for personal/team use with ClickUp. Ensure you have proper permissions and follow your organization's security policies.
