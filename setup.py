from setuptools import setup, find_packages
setup(
    name="es_bim", version="1.0.0",
    description="ES Building Information Management — 3D, 4D & 5D BIM Module for ERPNext",
    author="Enterprise Systems Australia", author_email="info@enterprisesystems.com.au",
    packages=find_packages(), zip_safe=False,
    include_package_data=True, install_requires=[],
)
