// An escaped local array must receive a stack canary. Keep a separate
// translation unit (without LTO) for the code-generation check in CI.
extern void consume_buffer(char *buffer);
int protected_stack(void);
int protected_stack(void)
{
    char buffer[64] = {0};
    consume_buffer(buffer);
    return buffer[0];
}
