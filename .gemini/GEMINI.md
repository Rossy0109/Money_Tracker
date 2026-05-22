## Gemini Added Memories
- The mcp-toolbox executable has been successfully installed by compiling from source. The user may need to create a tools.yaml file to configure their custom tools.
- The mcp-toolbox extension may fail to install its binary on Termux (Android). The fix is to install Go, then compile the toolbox from source using 'go install github.com/googleapis/genai-toolbox@v0.21.0', and then move the compiled binary from '$HOME/go/bin/genai-toolbox' to '~/.gemini/extensions/mcp-toolbox/toolbox'.
