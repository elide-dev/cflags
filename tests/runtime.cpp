// Exercise a virtual call into a separately built C++ runtime. Relative
// vtables can link successfully yet crash here with a conventional runtime.
#include <cstring>
#include <stdexcept>

__attribute__((noinline)) static const char *message(const std::exception &error)
{
    return error.what();
}

int main()
{
    const std::runtime_error error("runtime ABI probe");
    return std::strcmp(message(error), "runtime ABI probe") != 0;
}
