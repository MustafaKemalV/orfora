"""Load the RouterBench pickle with a RESTRICTED unpickler.

Only classes from pandas / numpy / a few safe stdlib data modules and a small set
of harmless builtins are permitted; anything else (os, posix, subprocess, sys,
builtins.eval/exec/__import__, importlib, ...) raises UnpicklingError. This
neutralises the arbitrary-code-execution vector of a malicious pickle while still
letting a legitimate pandas DataFrame load.
"""

import builtins
import pickle
import sys

SAFE_ROOTS = {
    "pandas",
    "numpy",
    "datetime",
    "decimal",
    "collections",
    "_codecs",
    "copyreg",
    "pytz",
    "zoneinfo",
}
SAFE_BUILTINS = {
    "list", "dict", "set", "frozenset", "tuple", "int", "float", "str",
    "bool", "bytes", "complex", "bytearray", "slice", "range", "object",
}


class SafeUnpickler(pickle.Unpickler):
    def find_class(self, module, name):
        root = module.split(".")[0]
        if root in SAFE_ROOTS:
            return super().find_class(module, name)
        if module == "builtins" and name in SAFE_BUILTINS:
            return getattr(builtins, name)
        raise pickle.UnpicklingError(f"BLOCKED global: {module}.{name}")


def load(path):
    with open(path, "rb") as f:
        return SafeUnpickler(f).load()


if __name__ == "__main__":
    df = load(sys.argv[1])
    print("type:", type(df).__module__ + "." + type(df).__name__)
    print("shape:", getattr(df, "shape", None))
    cols = list(df.columns)
    print("n_columns:", len(cols))
    for c in cols:
        print("COL", repr(c), str(df[c].dtype))
    if "eval_name" in cols:
        print("eval_name counts:", df["eval_name"].value_counts().to_dict())
