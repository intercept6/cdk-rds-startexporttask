FROM mcr.microsoft.com/devcontainers/base:noble

ARG USERNAME
ARG WORKSPACE_FOLDER

RUN mkdir -p $WORKSPACE_FOLDER/node_modules \
    && chown -R $USERNAME $WORKSPACE_FOLDER/node_modules

RUN SNIPPET="export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
    && mkdir /commandhistory \
    && touch /commandhistory/.bash_history \
    && chown -R $USERNAME /commandhistory \
    && echo "$SNIPPET" >> "/home/$USERNAME/.bashrc"
