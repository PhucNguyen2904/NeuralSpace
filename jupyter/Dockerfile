FROM jupyter/scipy-notebook:python-3.11

# Switch to root to install extra packages
USER root

RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    && rm -rf /var/lib/apt/lists/*

# Back to the default jupyter user
USER ${NB_UID}

# Install common data science / ML packages used by the platform
RUN pip install --no-cache-dir \
    pandas \
    numpy \
    matplotlib \
    seaborn \
    scikit-learn \
    ipywidgets \
    jupyterlab-git

# Expose port
EXPOSE 8888

# Start JupyterLab — token + CORS are injected via environment variables
CMD ["jupyter", "lab", \
     "--ip=0.0.0.0", \
     "--port=8888", \
     "--no-browser", \
     "--IdentityProvider.token=", \
     "--ServerApp.token=", \
     "--ServerApp.password=", \
     "--ServerApp.allow_origin=*", \
     "--ServerApp.allow_credentials=True", \
     "--ServerApp.allow_headers=*", \
     "--ServerApp.disable_check_xsrf=True"]
