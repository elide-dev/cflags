/* Externally visible data forces a relocation that must remain valid when
 * a separately compiled archive member is reused in a shared library.
 * A trailing -fPIE in the compile profile breaks this on ELF.
 */
int probe_value = 42;

int probe_read(void);
int probe_read(void)
{
    return probe_value;
}
